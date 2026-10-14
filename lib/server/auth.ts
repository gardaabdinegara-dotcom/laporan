import "server-only";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { OAuth2Client } from "google-auth-library";
import {
  DomainError,
  active,
  text,
  type Actor,
  type State,
  type Role,
} from "../domain.ts";
import { appURL, ownerEmail, sessionSecret } from "./config.ts";
export const SESSION = "garda_finance_session";
export const OAUTH = "garda_finance_oauth";
export const cookieOptions = () => ({
  httpOnly: true,
  secure: appURL().startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
});
export function sign(value: object) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", sessionSecret()).update(payload).digest("base64url")
  );
}
export function verify<T>(token: string): T | null {
  try {
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", sessionSecret())
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      exp: number;
    };
    if (!data.exp || data.exp < Date.now()) return null;
    return data as T;
  } catch {
    return null;
  }
}
export type Identity = {
  email: string;
  sub: string;
  name: string;
  exp: number;
};
export async function identity() {
  const jar = await cookies();
  return verify<Identity>(jar.get(SESSION)?.value || "");
}
export function authorize(who: Identity | null, state: State): Actor {
  if (!who)
    throw new DomainError(
      "Masuk dengan akun Google pemilik atau pengguna yang diizinkan.",
      "UNAUTHENTICATED",
      401,
    );
  const user = state.Pengguna.find(
    (u) => text(u, "email").toLowerCase() === who.email.toLowerCase(),
  );
  if (state.Pengguna.length === 0 && who.email.toLowerCase() === ownerEmail())
    return {
      id: "owner-initial",
      name: who.name,
      email: who.email,
      role: "OWNER",
    };
  if (
    !user ||
    !active(user) ||
    (user.google_sub && user.google_sub !== who.sub) ||
    !["OWNER", "ADMIN", "VIEWER"].includes(text(user, "role"))
  )
    throw new DomainError(
      "Akun ini tidak mendapat akses ke data keuangan.",
      "FORBIDDEN",
      403,
    );
  return {
    id: text(user, "user_id"),
    name: text(user, "nama") || who.name,
    email: who.email,
    role: text(user, "role") as Role,
  };
}
export function oauthClient() {
  if (
    !process.env.GOOGLE_OAUTH_CLIENT_ID ||
    !process.env.GOOGLE_OAUTH_CLIENT_SECRET
  )
    throw new DomainError(
      "Login Google belum dikonfigurasi. Isi OAuth client ID dan secret pada environment.",
      "CONFIG",
      503,
    );
  return new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    appURL() + "/api/auth/callback",
  );
}
export async function startOAuth() {
  const client = oauthClient();
  const state = randomBytes(24).toString("hex"),
    nonce = randomBytes(24).toString("hex");
  const { codeVerifier, codeChallenge } =
    await client.generateCodeVerifierAsync();
  const jar = await cookies();
  jar.set(
    OAUTH,
    sign({ state, nonce, verifier: codeVerifier, exp: Date.now() + 600000 }),
    { ...cookieOptions(), maxAge: 600 },
  );
  return client.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256" as never,
    prompt: "select_account",
  });
}
export async function finishOAuth(url: URL) {
  const jar = await cookies();
  const saved = verify<{ state: string; nonce: string; verifier: string }>(
    jar.get(OAUTH)?.value || "",
  );
  jar.delete(OAUTH);
  if (
    !saved ||
    !url.searchParams.get("state") ||
    saved.state !== url.searchParams.get("state") ||
    !url.searchParams.get("code")
  )
    throw new DomainError(
      "Sesi login tidak valid atau kedaluwarsa. Ulangi login.",
      "AUTH",
      401,
    );
  const client = oauthClient();
  const { tokens } = await client.getToken({
    code: url.searchParams.get("code")!,
    codeVerifier: saved.verifier,
  });
  if (!tokens.id_token)
    throw new DomainError(
      "Google tidak mengembalikan identitas yang valid.",
      "AUTH",
      401,
    );
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (
    !payload?.email ||
    !payload.email_verified ||
    (payload as typeof payload & { nonce?: string }).nonce !== saved.nonce
  )
    throw new DomainError("Identitas Google belum terverifikasi.", "AUTH", 401);
  return {
    email: payload.email.toLowerCase(),
    sub: payload.sub,
    name: payload.name || payload.email,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  } satisfies Identity;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new Set([appURL()]);
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://127.0.0.1:3012");
    allowed.add("http://localhost:3012");
  }
  if (!origin || !allowed.has(origin))
    throw new DomainError("Asal permintaan tidak diizinkan.", "ORIGIN", 403);
}
