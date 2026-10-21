import "server-only";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import { DomainError } from "../domain.ts";
import { spreadsheetId } from "./config.ts";
export type Gate = {
  operationId: string;
  hash: string;
  token: string;
  startedAt: number;
  actorId: string;
};
export type Rejection = { hash: string; actorId: string; error: string; code: string; status: number };
type RejectionClient = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: Rejection, options: { nx: true }): Promise<unknown>;
};
export function createRejections(client: RejectionClient, prefix: string) {
  return {
    read: (operationId: string) => client.get<Rejection>(prefix + operationId),
    record: async (gate: Gate, error: DomainError) => {
      const rejected: Rejection = { hash: gate.hash, actorId: gate.actorId, error: error.message, code: error.code, status: error.status };
      await client.set(prefix + gate.operationId, rejected, { nx: true });
      return rejected;
    },
  };
}
const redis = () => {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  )
    throw new DomainError(
      "Koordinator penulisan belum dikonfigurasi. Data nyata tetap dapat dibaca.",
      "COORDINATOR",
      503,
    );
  return Redis.fromEnv();
};
const key = () => "garda:finance:gate:" + spreadsheetId();
const rejections = () => createRejections(redis(), "garda:finance:rejected:" + spreadsheetId() + ":");
export const rejectionStatus = (operationId: string) => rejections().read(operationId);
export const rejectOperation = (gate: Gate, error: DomainError) => rejections().record(gate, error);
export async function gateStatus() {
  return await redis().get<Gate>(key());
}
export async function acquire(
  operationId: string,
  hash: string,
  actorId: string,
) {
  const value: Gate = {
    operationId,
    hash,
    actorId,
    token: randomUUID(),
    startedAt: Date.now(),
  };
  const result = await redis().set(key(), value, { nx: true });
  if (!result) {
    const pending = await gateStatus();
    throw new DomainError(
      pending?.operationId === operationId
        ? "Operasi ini sedang diverifikasi. Jangan membuat transaksi pengganti."
        : "Penulisan lain sedang berjalan atau menunggu verifikasi. Coba periksa status operasi.",
      "WRITE_PENDING",
      409,
    );
  }
  return value;
}
export async function release(gate: Gate) {
  await redis().eval(
    "local v=redis.call('GET',KEYS[1]); if v and cjson.decode(v).token==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
    [key()],
    [gate.token],
  );
}
export async function limit(scope: string, id: string, max = 60) {
  const r = redis();
  const bucket =
    "garda:finance:rate:" +
    scope +
    ":" +
    id +
    ":" +
    Math.floor(Date.now() / 60000);
  const count = await r.incr(bucket);
  if (count === 1) await r.expire(bucket, 90);
  if (count > max)
    throw new DomainError(
      "Terlalu banyak permintaan. Tunggu satu menit.",
      "RATE_LIMIT",
      429,
    );
}
