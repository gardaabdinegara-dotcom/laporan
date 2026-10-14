import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  applyCommand,
  DomainError,
  text,
  type State,
  type Command,
  type Actor,
} from "../../../lib/domain";
import { capabilities, appURL } from "../../../lib/server/config";
import {
  authorize,
  identity,
  checkOrigin,
  startOAuth,
  finishOAuth,
  sign,
  SESSION,
  cookieOptions,
} from "../../../lib/server/auth";
import {
  readState,
  setupSheets,
  commitState,
  SheetsError,
} from "../../../lib/server/sheets";
import {
  acquire,
  release,
  gateStatus,
  limit,
} from "../../../lib/server/coordinator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const envelope = z.object({
  operationId: z.string().uuid(),
  action: z.string().min(1).max(60),
  data: z.record(z.string(), z.unknown()),
});
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? "[" + value.map(canonical).join(",") + "]"
    : value && typeof value === "object"
      ? "{" +
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
          .join(",") +
        "}"
      : JSON.stringify(value);
function safeState(state: State, actor: Actor) {
  const s = structuredClone(state);
  if (actor.role !== "OWNER") {
    s.Pengguna = [];
    s.Operasi = [];
  }
  if (actor.role === "VIEWER")
    s.Siswa = s.Siswa.map((r) => ({
      ...r,
      no_wa: "",
      no_wa_wali: "",
      nama_wali: "",
      catatan: "",
    }));
  return s;
}
function failure(error: unknown) {
  if (error instanceof DomainError)
    return reply({ error: error.message, code: error.code }, error.status);
  if (error instanceof SheetsError)
    return reply(
      { error: error.message, code: "GOOGLE_API" },
      error.status === 429 ? 429 : 503,
    );
  if (error instanceof z.ZodError)
    return reply(
      { error: "Format permintaan tidak valid.", code: "VALIDATION" },
      422,
    );
  console.error("finance_api_error", {
    name: error instanceof Error ? error.name : "Unknown",
  });
  return reply(
    {
      error:
        "Layanan sementara tidak tersedia. Coba muat ulang atau periksa konfigurasi server.",
      code: "SERVICE",
    },
    503,
  );
}
async function logged() {
  const who = await identity();
  if (!who)
    throw new DomainError(
      "Masuk dengan Google untuk menggunakan data nyata.",
      "UNAUTHENTICATED",
      401,
    );
  const loaded = await readState();
  return { ...loaded, actor: authorize(who, loaded.state), who };
}
export async function GET(request: NextRequest) {
  const route = request.nextUrl.pathname.slice(5);
  try {
    if (route === "health")
      return reply({ ok: true, capabilities: capabilities() });
    if (route === "auth/start") {
      if (request.nextUrl.origin !== new URL(appURL()).origin)
        return NextResponse.redirect(appURL() + "/api/auth/start");
      return NextResponse.redirect(await startOAuth());
    }
    if (route === "auth/callback") {
      try {
        const who = await finishOAuth(request.nextUrl);
        const { state } = await readState();
        authorize(who, state);
        (await cookies()).set(SESSION, sign(who), {
          ...cookieOptions(),
          maxAge: 43200,
        });
        return NextResponse.redirect(appURL() + "/?mode=real");
      } catch (error) {
        const code =
          error instanceof DomainError && error.code === "FORBIDDEN"
            ? "forbidden"
            : "login_failed";
        return NextResponse.redirect(appURL() + "/?auth_error=" + code);
      }
    }
    if (route === "session") {
      const who = await identity();
      if (!who)
        return reply({ authenticated: false, capabilities: capabilities() });
      const loaded = await logged();
      return reply({
        authenticated: true,
        actor: loaded.actor,
        initialized: loaded.initialized,
        capabilities: capabilities(),
      });
    }
    if (route === "data" || route === "backup") {
      const loaded = await logged();
      if (route === "backup") {
        if (loaded.actor.role !== "OWNER")
          throw new DomainError(
            "Backup lengkap hanya untuk pemilik.",
            "FORBIDDEN",
            403,
          );
        return new NextResponse(
          JSON.stringify(
            {
              schema: 1,
              exportedAt: new Date().toISOString(),
              data: loaded.state,
            },
            null,
            2,
          ),
          {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition":
                'attachment; filename="garda-keuangan-backup.json"',
              "Cache-Control": "no-store",
            },
          },
        );
      }
      const dataPayload = {
        state: safeState(loaded.state, loaded.actor),
        actor: loaded.actor,
        initialized: loaded.initialized,
        dataAsOf: new Date().toISOString(),
        capabilities: capabilities(),
      };
      if (Buffer.byteLength(JSON.stringify(dataPayload)) > 3800000)
        throw new DomainError(
          "Ukuran data terlalu besar untuk satu respons. Arsipkan data atau migrasikan sumber melalui pemeliharaan terkontrol.",
          "CAPACITY",
          409,
        );
      return reply(dataPayload);
    }
    if (route === "operations") {
      const { state, actor, initialized } = await logged();
      const gate = capabilities().coordinator ? await gateStatus() : null;
      const id =
        request.nextUrl.searchParams.get("id") ||
        (actor.role === "OWNER" ? gate?.operationId : null);
      const op = state.Operasi.find((o) => o.operation_id === id);
      if (op && actor.role !== "OWNER" && op.actor_id !== actor.id)
        throw new DomainError("Operasi tidak dapat diakses.", "FORBIDDEN", 403);
      if (
        gate?.operationId.startsWith("setup-") &&
        actor.role === "OWNER" &&
        initialized
      ) {
        await release(gate);
        return reply({
          status: "COMMITTED",
          result: { setup: true },
          pending: null,
        });
      }
      if (op && gate && gate.operationId === id) await release(gate);
      return reply({
        status: op
          ? "COMMITTED"
          : gate?.operationId === id
            ? "VERIFYING"
            : "NOT_FOUND",
        result: op ? JSON.parse(text(op, "result_json") || "{}") : null,
        pending:
          actor.role === "OWNER" && gate
            ? { operationId: gate.operationId, startedAt: gate.startedAt }
            : null,
      });
    }
    return reply({ error: "Endpoint tidak ditemukan." }, 404);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  const route = request.nextUrl.pathname.slice(5);
  try {
    checkOrigin(request);
    if (route === "auth/logout") {
      (await cookies()).delete(SESSION);
      return reply({ ok: true });
    }
    const who = await identity();
    if (!who)
      throw new DomainError("Login diperlukan.", "UNAUTHENTICATED", 401);
    const raw = await request.text();
    if (raw.length > 100000) throw new DomainError("Permintaan terlalu besar.");
    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      throw new DomainError("JSON permintaan tidak valid.");
    }
    if (!capabilities().writeEnabled)
      throw new DomainError(
        "Penulisan nyata belum diaktifkan. Isi konfigurasi dan APP_WRITE_ENABLED=true.",
        "READ_ONLY",
        503,
      );
    if (route === "setup") {
      const loaded = await readState().catch((error) => {
        if (error instanceof DomainError && error.code === "SCHEMA_INCOMPLETE")
          return {
            state: { Pengguna: [] } as unknown as State,
            initialized: false,
          };
        throw error;
      });
      const actor = authorize(who, loaded.state);
      if (actor.role !== "OWNER")
        throw new DomainError("Setup hanya untuk pemilik.", "FORBIDDEN", 403);
      const gate = await acquire(
        "setup-" + String(body.operationId),
        "setup-v1",
        actor.id,
      );
      try {
        const result = await setupSheets();
        await release(gate);
        return reply({ added: result.added, initialized: true });
      } catch (error) {
        if (error instanceof SheetsError && error.definitive)
          await release(gate);
        throw error;
      }
    }
    if (route !== "mutate")
      return reply({ error: "Endpoint tidak ditemukan." }, 404);
    const command = envelope.parse(body) as Command;
    await limit("mutate", who.sub, 15);
    const hash = createHash("sha256").update(canonical(command)).digest("hex");
    const before = await readState();
    const actor = authorize(who, before.state);
    if (actor.role === "VIEWER")
      throw new DomainError(
        "Akun pembaca tidak dapat mengubah data.",
        "FORBIDDEN",
        403,
      );
    const existing = before.state.Operasi.find(
      (o) => o.operation_id === command.operationId,
    );
    if (existing) {
      if (existing.request_hash !== hash)
        throw new DomainError(
          "Operation ID sudah dipakai dengan isi berbeda.",
          "OPERATION_CONFLICT",
          409,
        );
      return reply({
        operationId: command.operationId,
        result: JSON.parse(text(existing, "result_json")),
        committed: true,
      });
    }
    if (!before.initialized)
      throw new DomainError(
        "Jalankan setup spreadsheet terlebih dahulu.",
        "NOT_INITIALIZED",
        409,
      );
    const gate = await acquire(command.operationId, hash, actor.id);
    let writing = false;
    try {
      const latest = await readState();
      const currentActor = authorize(who, latest.state);
      const duplicate = latest.state.Operasi.find(
        (o) => o.operation_id === command.operationId,
      );
      if (duplicate) {
        if (duplicate.request_hash !== hash)
          throw new DomainError(
            "Operation ID sudah dipakai dengan isi berbeda.",
            "OPERATION_CONFLICT",
            409,
          );
        await release(gate);
        return reply({
          operationId: command.operationId,
          result: JSON.parse(text(duplicate, "result_json")),
          committed: true,
        });
      }
      const result = applyCommand(latest.state, command, currentActor);
      result.state.Operasi.at(-1)!.request_hash = hash;
      writing = true;
      await commitState(latest.state, result.state);
      await release(gate);
      return reply({
        operationId: command.operationId,
        result: result.result,
        committed: true,
      });
    } catch (error) {
      if (
        !writing ||
        error instanceof DomainError ||
        (error instanceof SheetsError && error.definitive)
      )
        await release(gate);
      else
        return reply(
          {
            error:
              "Hasil simpan sedang diverifikasi. Jangan mengulangi dengan transaksi baru.",
            code: "WRITE_UNCERTAIN",
            operationId: command.operationId,
          },
          202,
        );
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
