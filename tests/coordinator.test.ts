import { test } from "node:test";
import assert from "node:assert/strict";
import { createRejections, type Rejection, type Gate } from "../lib/server/coordinator.ts";
import { DomainError } from "../lib/domain.ts";

test("keputusan penolakan tetap berlaku untuk salinan request yang datang terlambat", async () => {
  const data = new Map<string, Rejection>();
  const client = {
    async get<T>(key: string) { return (data.get(key) || null) as T | null; },
    async set(key: string, value: Rejection, options: { nx: true }) {
      assert.deepEqual(options, { nx: true });
      if (data.has(key)) return null;
      data.set(key, structuredClone(value)); return "OK";
    },
  };
  const first = createRejections(client, "isolated:"), otherInstance = createRejections(client, "isolated:");
  const gate: Gate = { operationId: "test-operation", hash: "original-hash", actorId: "owner", token: "gate-token", startedAt: 0 };
  assert.equal(await first.read(gate.operationId), null);
  await first.record(gate, new DomainError("Pembayaran melebihi sisa tagihan."));
  const rejection = await otherInstance.read(gate.operationId);
  assert.equal(rejection?.hash, "original-hash");
  assert.equal(rejection?.actorId, "owner");
  assert.equal(rejection?.error, "Pembayaran melebihi sisa tagihan.");
  await otherInstance.record(gate, new DomainError("Alasan berikutnya tidak mengganti keputusan awal."));
  assert.deepEqual(await first.read(gate.operationId), rejection);
  assert.equal(await createRejections(client, "different-spreadsheet:").read(gate.operationId), null);
});
