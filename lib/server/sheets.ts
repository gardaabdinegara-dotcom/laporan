import "server-only";
import { JWT } from "google-auth-library";
import {
  COLUMNS,
  TABLES,
  KEYS,
  emptyState,
  initialState,
  text,
  validateState,
  DomainError,
  type State,
  type Cell,
  type Row,
  type Table,
} from "../domain.ts";
import { credentials, spreadsheetId, ownerEmail } from "./config.ts";
import { limit } from "./coordinator.ts";

type SheetMeta = {
  properties: {
    sheetId: number;
    title: string;
    gridProperties?: { rowCount: number; columnCount: number };
  };
};
type Metadata = {
  sheets: SheetMeta[];
  properties: { title: string; timeZone: string };
};
let client: JWT | undefined,
  metadataCache: { value: Metadata; expires: number } | undefined;
export class SheetsError extends Error {
  status: number;
  definitive: boolean;
  constructor(status: number, definitive: boolean) {
    super(
      status === 403
        ? "Service account belum mendapat izin yang diperlukan, atau API belum aktif."
        : status === 429
          ? "Kuota Google Sheets sedang penuh. Coba beberapa saat lagi."
          : "Google Sheets sedang tidak dapat diakses.",
    );
    this.status = status;
    this.definitive = definitive;
  }
}
async function api<T>(
  suffix: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (!client) {
    const c = credentials();
    client = new JWT({
      email: c.email,
      key: c.key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }
  const token = (await client.getAccessToken()).token;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId()}${suffix}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    },
  );
  if (!response.ok)
    throw new SheetsError(
      response.status,
      [400, 401, 403, 404, 405, 409, 412, 413, 415, 422, 429].includes(
        response.status,
      ),
    );
  return (await response.json()) as T;
}
export async function metadata(force = false) {
  if (!force && metadataCache && metadataCache.expires > Date.now())
    return metadataCache.value;
  const value = await api<Metadata>(
    "?fields=properties(title,timeZone),sheets(properties(sheetId,title,gridProperties))",
  );
  metadataCache = { value, expires: Date.now() + 300000 };
  return value;
}
const cell = (v: Cell) => ({
  userEnteredValue:
    typeof v === "number"
      ? { numberValue: v }
      : typeof v === "boolean"
        ? { boolValue: v }
        : { stringValue: v },
});
const cells = (table: Table, row: Row) => ({
  values: COLUMNS[table].map((key) => cell(row[key] ?? "")),
});
export async function readState() {
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  )
    await limit("google-read", spreadsheetId(), 50);
  const meta = await metadata();
  const existing = TABLES.filter((t) =>
    meta.sheets.some((s) => s.properties.title === t),
  );
  const state = emptyState();
  if (!existing.length) return { state, initialized: false, meta };
  if (existing.length !== TABLES.length)
    throw new DomainError(
      "Struktur spreadsheet belum lengkap. Jalankan setup untuk menambahkan tabel yang hilang.",
      "SCHEMA_INCOMPLETE",
      409,
    );
  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  existing.forEach((t) => params.append("ranges", `'${t}'!A1:AZ50001`));
  const data = await api<{ valueRanges: { values?: Cell[][] }[] }>(
    "/values:batchGet?" + params,
  );
  existing.forEach((table, i) => {
    const rows = data.valueRanges[i].values || [];
    const header = rows[0] || [];
    if (
      header.length !== COLUMNS[table].length ||
      header.some((v, j) => v !== COLUMNS[table][j])
    )
      throw new DomainError(
        `Header ${table} berubah. Pulihkan struktur sebelum melanjutkan.`,
        "SCHEMA",
        409,
      );
    const seen = new Map<string, string>();
    for (const values of rows.slice(1)) {
      if (!values.some((v) => v !== "" && v !== undefined))
        throw new DomainError(
          `Ada baris kosong di tengah tabel ${table}. Hapus baris kosong pada mode pemeliharaan agar posisi record tetap jelas.`,
          "DATA_INTEGRITY",
          409,
        );
      const row = Object.fromEntries(
        COLUMNS[table].map((k, j) => [k, values[j] ?? ""]),
      ) as Row;
      const key = text(row, KEYS[table]);
      const serialized = JSON.stringify(row);
      if (seen.has(key)) {
        if (seen.get(key) !== serialized)
          throw new DomainError(
            `ID ganda dengan isi berbeda pada ${table}.`,
            "DATA_INTEGRITY",
            409,
          );
        throw new DomainError(
          `Ditemukan baris ganda pada ${table}. Periksa dan pulihkan data sebelum menulis.`,
          "DATA_INTEGRITY",
          409,
        );
      }
      seen.set(key, serialized);
      state[table].push(row);
    }
    if (rows.length >= 50001)
      throw new DomainError(
        `Tabel ${table} mencapai batas pembacaan aplikasi. Arsipkan atau migrasikan data.`,
        "CAPACITY",
        409,
      );
  });
  validateState(state);
  return { state, initialized: true, meta };
}
export async function setupSheets() {
  const meta = await metadata(true);
  const missing = TABLES.filter(
    (t) => !meta.sheets.some((s) => s.properties.title === t),
  );
  const initial = initialState(ownerEmail());
  const requests: unknown[] = [];
  let next = Math.max(0, ...meta.sheets.map((s) => s.properties.sheetId)) + 1;
  for (const table of missing) {
    const sheetId = next++;
    requests.push({
      addSheet: {
        properties: {
          sheetId,
          title: table,
          gridProperties: {
            rowCount: 1000,
            columnCount: Math.max(26, COLUMNS[table].length),
            frozenRowCount: 1,
          },
        },
      },
    });
    requests.push({
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [
          { values: COLUMNS[table].map((k) => cell(k)) },
          ...initial[table].map((r) => cells(table, r)),
        ],
        fields: "userEnteredValue",
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.06, green: 0.15, blue: 0.2 },
            textFormat: {
              bold: true,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
          },
        },
        fields: "userEnteredFormat",
      },
    });
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          warningOnly: true,
          description: "Header database: pertahankan nama dan urutannya.",
        },
      },
    });
  }
  if (requests.length) {
    requests.push({
      updateSpreadsheetProperties: {
        properties: { timeZone: process.env.APP_TIMEZONE || "Asia/Jakarta" },
        fields: "timeZone",
      },
    });
    await api(":batchUpdate", "POST", { requests });
    metadataCache = undefined;
  }
  return { added: missing, ...(await readState()) };
}
export async function commitState(before: State, after: State) {
  const meta = await metadata();
  const requests: unknown[] = [];
  for (const table of TABLES) {
    const sheet = meta.sheets.find((s) => s.properties.title === table);
    if (!sheet)
      throw new DomainError(`Tab ${table} tidak tersedia.`, "SCHEMA", 409);
    const id = sheet.properties.sheetId,
      added: Row[] = [];
    for (const row of after[table]) {
      const index = before[table].findIndex(
        (r) => r[KEYS[table]] === row[KEYS[table]],
      );
      if (index < 0) added.push(row);
      else if (JSON.stringify(before[table][index]) !== JSON.stringify(row))
        requests.push({
          updateCells: {
            start: { sheetId: id, rowIndex: index + 1, columnIndex: 0 },
            rows: [cells(table, row)],
            fields: "userEnteredValue",
          },
        });
    }
    if (added.length)
      requests.push({
        appendCells: {
          sheetId: id,
          rows: added.map((r) => cells(table, r)),
          fields: "userEnteredValue",
        },
      });
  }
  if (Buffer.byteLength(JSON.stringify({ requests })) > 1800000)
    throw new DomainError(
      "Operasi terlalu besar. Bagi menjadi beberapa proses.",
    );
  await api(":batchUpdate", "POST", { requests });
}
export async function restoreToBlank(backup: State) {
  validateState(backup);
  if (
    !backup.Pengguna.some(
      (u) => u.role === "OWNER" && (u.aktif === true || u.aktif === "true"),
    )
  )
    throw new DomainError("Backup harus memiliki OWNER aktif.");
  const loaded = await readState();
  if (!loaded.initialized)
    throw new DomainError(
      "Jalankan setup pada spreadsheet tujuan terlebih dahulu.",
    );
  if (
    [
      "Transaksi",
      "Siswa",
      "Pendaftaran",
      "Tagihan",
      "Operasi",
      "Penyesuaian_Tagihan",
    ].some((t) => loaded.state[t as Table].length > 0) ||
    loaded.state.Akun.some((a) => Number(a.saldo_awal) !== 0)
  )
    throw new DomainError(
      "Pemulihan hanya diizinkan ke spreadsheet baru/kosong dengan saldo awal nol. Data yang sudah dipakai tidak ditimpa.",
    );
  const requests: unknown[] = [];
  for (const table of TABLES) {
    const sheet = loaded.meta.sheets.find((s) => s.properties.title === table)!;
    const count =
      Math.max(backup[table].length, loaded.state[table].length) + 1;
    if (count > (sheet.properties.gridProperties?.rowCount || 1000))
      requests.push({
        updateSheetProperties: {
          properties: {
            sheetId: sheet.properties.sheetId,
            gridProperties: { rowCount: count + 100 },
          },
          fields: "gridProperties.rowCount",
        },
      });
    requests.push({
      updateCells: {
        range: {
          sheetId: sheet.properties.sheetId,
          startRowIndex: 1,
          endRowIndex: Math.max(2, count),
          startColumnIndex: 0,
          endColumnIndex: COLUMNS[table].length,
        },
        rows: backup[table].map((r) => cells(table, r)),
        fields: "userEnteredValue",
      },
    });
  }
  if (Buffer.byteLength(JSON.stringify({ requests })) > 1800000)
    throw new DomainError(
      "Backup melebihi ukuran pemulihan satu batch. Bagi/migrasikan melalui prosedur terkontrol.",
    );
  await api(":batchUpdate", "POST", { requests });
  return await readState();
}
