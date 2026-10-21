import type { Command } from "./domain.ts";

export function operationStatus(committed: boolean, operationId: string | null, gateId: string | null, rejected = false) {
  return committed ? "COMMITTED" : rejected ? "REJECTED" : gateId && gateId === operationId ? "VERIFYING" : gateId ? "BUSY" : "RETRYABLE";
}

export function restorePendingCommand(raw: string | null, actorId: string, operationId: string): Command | null {
  try {
    const saved = JSON.parse(raw || "null"), command = saved?.command;
    if (saved?.actorId !== actorId || command?.operationId !== operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) return null;
    if (typeof command.action !== "string" || !command.action || command.action.length > 60 || !command.data || typeof command.data !== "object" || Array.isArray(command.data)) return null;
    return command as Command;
  } catch { return null; }
}
