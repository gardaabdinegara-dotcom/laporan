import "server-only";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DomainError, OWNER_EMAIL } from "../domain.ts";
export function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const local = path.join(process.cwd(), "credentials.json");
  const data = raw
    ? JSON.parse(raw)
    : process.env.NODE_ENV !== "production" && existsSync(local)
      ? JSON.parse(readFileSync(local, "utf8"))
      : null;
  if (
    !data ||
    data.type !== "service_account" ||
    !data.client_email ||
    !data.private_key
  )
    throw new DomainError(
      "Kredensial Google Sheets belum dikonfigurasi di server.",
      "CONFIG",
      503,
    );
  return {
    email: String(data.client_email),
    key: String(data.private_key).replace(/\\n/g, "\n"),
  };
}
export const spreadsheetId = () =>
  process.env.GOOGLE_SPREADSHEET_ID ||
  "1_F6hZLKgpYdehD4BaWKLs1fG6E3T-gvBuJELvLLdN7s";
export const ownerEmail = () =>
  (process.env.INITIAL_OWNER_EMAIL || OWNER_EMAIL).trim().toLowerCase();
export const appURL = () =>
  (
    process.env.APP_URL ||
    (process.env.VERCEL_URL
      ? "https://" + process.env.VERCEL_URL
      : "http://localhost:3012")
  ).replace(/\/$/, "");
export function sessionSecret() {
  const key = process.env.AUTH_SECRET || "";
  if (key.length < 32)
    throw new DomainError(
      "AUTH_SECRET belum diisi dengan nilai acak minimal 32 karakter.",
      "CONFIG",
      503,
    );
  return key;
}
export function capabilities() {
  let sheets = false;
  try {
    credentials();
    sheets = true;
  } catch {
    /* Return readiness only. */
  }
  return {
    sheets,
    oauth: Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_ID &&
        process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
        (process.env.AUTH_SECRET || "").length >= 32,
    ),
    coordinator: Boolean(
      process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN,
    ),
    writeEnabled: process.env.APP_WRITE_ENABLED === "true",
    ownerEmail: ownerEmail(),
  };
}
