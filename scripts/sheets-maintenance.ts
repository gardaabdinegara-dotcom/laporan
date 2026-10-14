import { readFileSync, existsSync, writeFileSync } from "node:fs";
import {
  initialState,
  validateState,
  finance,
  TABLES,
  active,
  type State,
} from "../lib/domain.ts";
import {
  metadata,
  setupSheets,
  readState,
  restoreToBlank,
} from "../lib/server/sheets.ts";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const [action, ...args] = process.argv.slice(2);
try {
  if (action === "setup") {
    const meta = await metadata(true);
    console.log(
      JSON.stringify({
        action,
        existingTabs: meta.sheets.map((s) => s.properties.title),
        expectedTables: TABLES,
        apply: args.includes("--apply"),
      }),
    );
    if (args.includes("--apply")) {
      if (process.env.APP_WRITE_ENABLED === "true")
        throw new Error(
          "Nonaktifkan penulisan aplikasi dan hentikan instance sebelum setup pemeliharaan.",
        );
      const result = await setupSheets();
      console.log(
        JSON.stringify({
          initialized: result.initialized,
          addedTables: result.added,
          students: result.state.Siswa.length,
          financialTransactions: result.state.Transaksi.length,
          simulationImported: false,
        }),
      );
    }
  } else if (action === "read") {
    const result = await readState();
    console.log(
      JSON.stringify({
        initialized: result.initialized,
        counts: Object.fromEntries(
          TABLES.map((t) => [t, result.state[t].length]),
        ),
        noDataRowsPrinted: true,
      }),
    );
  } else if (action === "backup") {
    const file = args[0];
    if (!file) throw new Error("Berikan path output backup yang privat.");
    if (existsSync(file))
      throw new Error("File output sudah ada; pilih nama baru.");
    const result = await readState();
    writeFileSync(
      file,
      JSON.stringify(
        { schema: 1, exportedAt: new Date().toISOString(), data: result.state },
        null,
        2,
      ),
      { flag: "wx" },
    );
    console.log(JSON.stringify({ backupWritten: true, tables: TABLES.length }));
  } else if (action === "validate" || action === "restore") {
    const file = args[0];
    if (!file) throw new Error("Berikan path backup.");
    const content = JSON.parse(readFileSync(file, "utf8"));
    if (content.schema !== 1 || content.simulation)
      throw new Error(
        "Gunakan backup data nyata versi 1; data contoh tidak diimpor ke produksi.",
      );
    const state = content.data as State;
    validateState(state);
    if (!state.Pengguna.some((u) => u.role === "OWNER" && active(u)))
      throw new Error("OWNER aktif tidak ditemukan.");
    console.log(
      JSON.stringify({
        backupValid: true,
        counts: Object.fromEntries(TABLES.map((t) => [t, state[t].length])),
      }),
    );
    if (action === "restore" && args.includes("--apply")) {
      if (process.env.APP_WRITE_ENABLED === "true")
        throw new Error(
          "Nonaktifkan penulisan dan hentikan aplikasi sebelum pemulihan.",
        );
      const restored = await restoreToBlank(state);
      console.log(
        JSON.stringify({
          restored: true,
          counts: Object.fromEntries(
            TABLES.map((t) => [t, restored.state[t].length]),
          ),
        }),
      );
    }
  } else
    throw new Error(
      "Tindakan: setup [--apply], read, backup <file>, validate <file>, restore <file> [--apply].",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Operasi gagal.");
  process.exitCode = 1;
}
