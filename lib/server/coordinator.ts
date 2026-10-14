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
