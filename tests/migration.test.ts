import { test } from "node:test";
import assert from "node:assert/strict";
import { JWT } from "google-auth-library";
import { COLUMNS, TABLES, demoState, type Cell, type Row, type Table } from "../lib/domain.ts";
import { REPORT_TABLES } from "../lib/reporting.ts";
import { metadata, readState, setupSheets } from "../lib/server/sheets.ts";

test("migrasi Sheets versi 1 menambah tabel, mempertahankan ID/nominal, dan dapat diulang (API tiruan terisolasi)", async context => {
  const envKeys = ["GOOGLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SPREADSHEET_ID", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  const oldEnv = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ type: "service_account", client_email: "migration@example.invalid", private_key: "TEST ONLY" });
  process.env.GOOGLE_SPREADSHEET_ID = "isolated-migration-test";
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  context.after(() => { for (const key of envKeys) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; } });
  context.mock.method(JWT.prototype, "getAccessToken", async () => ({ token: "isolated-test-token" }));
  const source = demoState();
  source.Pengaturan = source.Pengaturan.filter(r => !/reporting_|tax_basis|report_/.test(String(r.key)));
  source.Pengaturan.find(r => r.key === "schema_version")!.value = "1";
  type FakeSheet = { id: number; title: string; rows: Cell[][] };
  const sheets: FakeSheet[] = TABLES.filter(t => !(REPORT_TABLES as readonly string[]).includes(t)).map((table, index) => ({ id: index, title: table, rows: [COLUMNS[table], ...source[table].map(r => COLUMNS[table].map(key => r[key] ?? ""))] }));
  sheets.push({ id: 100, title: "Sheet1", rows: [["Sumber lama", 123]] });
  const preserved = JSON.stringify({ Transaksi: sheets.find(s => s.title === "Transaksi")!.rows, Tagihan: sheets.find(s => s.title === "Tagihan")!.rows, Sheet1: sheets.find(s => s.title === "Sheet1")!.rows });
  let writes = 0;
  context.mock.method(globalThis, "fetch", async (urlInput: string | URL | Request, options?: RequestInit) => {
    const url = new URL(String(urlInput));
    assert.equal(url.origin, "https://sheets.googleapis.com");
    assert.ok(url.pathname.startsWith("/v4/spreadsheets/isolated-migration-test"));
    const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.pathname.endsWith("/values:batchGet")) return reply({ valueRanges: url.searchParams.getAll("ranges").map(range => ({ values: sheets.find(s => s.title === range.split("'")[1])!.rows })) });
    if (url.pathname.endsWith(":batchUpdate")) {
      writes++;
      const body = JSON.parse(String(options?.body));
      const decode = (row: { values: { userEnteredValue: Record<string, Cell> }[] }) => row.values.map(cell => Object.values(cell.userEnteredValue)[0]);
      for (const request of body.requests) {
        if (request.addSheet) sheets.push({ id: request.addSheet.properties.sheetId, title: request.addSheet.properties.title, rows: [] });
        if (request.updateCells) {
          const update = request.updateCells, sheet = sheets.find(s => s.id === update.start.sheetId)!;
          for (let i = 0; i < update.rows.length; i++) {
            const index = update.start.rowIndex + i, values = decode(update.rows[i]);
            sheet.rows[index] ||= [];
            values.forEach((value, j) => { sheet.rows[index][update.start.columnIndex + j] = value; });
          }
        }
        if (request.appendCells) sheets.find(s => s.id === request.appendCells.sheetId)!.rows.push(...request.appendCells.rows.map(decode));
      }
      return reply({});
    }
    return reply({ properties: { title: "Isolated test", timeZone: "Asia/Jakarta" }, sheets: sheets.map(s => ({ properties: { sheetId: s.id, title: s.title, gridProperties: { rowCount: 1000, columnCount: 26 } } })) });
  });
  await metadata(true);
  const before = await readState();
  assert.equal(before.initialized, true); assert.equal(before.schemaReady, false);
  assert.equal(before.state.Aset.length, 0); assert.equal(writes, 0);
  const migrated = await setupSheets();
  assert.deepEqual(migrated.added, [...REPORT_TABLES]); assert.equal(migrated.schemaReady, true);
  assert.deepEqual(migrated.state.Transaksi, before.state.Transaksi); assert.deepEqual(migrated.state.Tagihan, before.state.Tagihan);
  assert.equal(JSON.stringify({ Transaksi: sheets.find(s => s.title === "Transaksi")!.rows, Tagihan: sheets.find(s => s.title === "Tagihan")!.rows, Sheet1: sheets.find(s => s.title === "Sheet1")!.rows }), preserved);
  assert.ok(REPORT_TABLES.every(table => migrated.state[table].length === 0));
  const repeated = await setupSheets();
  assert.equal(repeated.added.length, 0); assert.equal(repeated.schemaReady, true);
  assert.equal(writes, 1, "Mengulang migrasi yang sudah selesai tidak mengirim penulisan baru.");
  assert.equal(sheets.filter(s => (REPORT_TABLES as readonly string[]).includes(s.title)).length, REPORT_TABLES.length);
  sheets.find(s => s.title === "Aset")!.rows[0][0] = "header-berubah";
  await assert.rejects(() => readState(), /Header Aset berubah/);
});
