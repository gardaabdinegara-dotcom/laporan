import { applyReportCommand, validateReportState } from "./report-commands.ts";
export type Cell = string | number | boolean;
export type Row = Record<string, Cell>;
export const TABLES = [
  "Pengaturan",
  "Pengguna",
  "Program",
  "Siswa",
  "Pendaftaran",
  "Tagihan",
  "Jadwal_Tagihan",
  "Penyesuaian_Tagihan",
  "Akun",
  "Kategori",
  "Transaksi",
  "Operasi",
  "Pemetaan_Laporan",
  "Aset",
  "Saldo_Neraca",
  "Jurnal_Laporan",
  "Tarif_Pajak",
  "Pembayaran_Pajak",
] as const;
export type Table = (typeof TABLES)[number];
export type State = Record<Table, Row[]>;
export type Role = "OWNER" | "ADMIN" | "VIEWER";
export type Actor = { id: string; name: string; email: string; role: Role };
export type Command = {
  operationId: string;
  action: string;
  data: Record<string, unknown>;
};
export const OWNER_EMAIL = "gardaabdinegara@gmail.com";
export const KEYS: Record<Table, string> = {
  Pengaturan: "key",
  Pengguna: "user_id",
  Program: "program_id",
  Siswa: "siswa_id",
  Pendaftaran: "pendaftaran_id",
  Tagihan: "tagihan_id",
  Jadwal_Tagihan: "jadwal_id",
  Penyesuaian_Tagihan: "penyesuaian_id",
  Akun: "akun_id",
  Kategori: "kategori_id",
  Transaksi: "transaksi_id",
  Operasi: "operation_id",
  Pemetaan_Laporan: "pemetaan_id",
  Aset: "aset_id",
  Saldo_Neraca: "saldo_id",
  Jurnal_Laporan: "baris_id",
  Tarif_Pajak: "tarif_id",
  Pembayaran_Pajak: "pembayaran_id",
};
const audit = ["created_at", "created_by", "updated_at", "updated_by"];
export const COLUMNS: Record<Table, string[]> = {
  Pemetaan_Laporan: ["pemetaan_id", "kategori_id", "kelompok", "berlaku_mulai", "operation_id", ...audit],
  Aset: ["aset_id", "nama_aset", "sumber", "transaksi_id", "tanggal_perolehan", "tanggal_mulai", "tanggal_saldo_awal", "harga_perolehan", "umur_bulan", "nilai_residu", "akumulasi_awal", "catatan", "operation_id", ...audit],
  Saldo_Neraca: ["saldo_id", "versi", "tanggal", "akun_laporan", "debit", "kredit", "sumber", "operation_id", ...audit],
  Jurnal_Laporan: ["baris_id", "jurnal_id", "tanggal", "akun_laporan", "debit", "kredit", "deskripsi", "rujukan", "jurnal_rujukan_id", "operation_id", ...audit],
  Tarif_Pajak: ["tarif_id", "berlaku_mulai", "tarif_basis_poin", "catatan", "operation_id", ...audit],
  Pembayaran_Pajak: ["pembayaran_id", "transaksi_id", "periode_pajak", "perlakuan", "catatan", "operation_id", ...audit],
  Pengaturan: ["key", "value", "updated_at", "updated_by"],
  Pengguna: [
    "user_id",
    "google_sub",
    "email",
    "nama",
    "role",
    "aktif",
    ...audit,
  ],
  Program: [
    "program_id",
    "nama_program",
    "target_seleksi",
    "skema_default",
    "tarif_default",
    "aktif",
    ...audit,
  ],
  Siswa: [
    "siswa_id",
    "nama",
    "no_wa",
    "nama_wali",
    "no_wa_wali",
    "tanggal_daftar",
    "aktif",
    "catatan",
    ...audit,
  ],
  Pendaftaran: [
    "pendaftaran_id",
    "siswa_id",
    "program_id",
    "angkatan",
    "tanggal_mulai",
    "tanggal_selesai",
    "skema_biaya",
    "tarif_disepakati",
    "hari_jatuh_tempo",
    "status",
    ...audit,
  ],
  Tagihan: [
    "tagihan_id",
    "nomor_tagihan",
    "pendaftaran_id",
    "jenis_tagihan",
    "periode_layanan",
    "tanggal_terbit",
    "nominal_dasar",
    "diskon_awal",
    "menggantikan_tagihan_id",
    "operation_id",
    ...audit,
  ],
  Jadwal_Tagihan: [
    "jadwal_id",
    "tagihan_id",
    "urutan",
    "jatuh_tempo",
    "nominal",
    "operation_id",
  ],
  Penyesuaian_Tagihan: [
    "penyesuaian_id",
    "tagihan_id",
    "tanggal_efektif",
    "jenis",
    "nominal",
    "penyesuaian_rujukan_id",
    "alasan",
    "operation_id",
  ],
  Akun: [
    "akun_id",
    "nama_akun",
    "jenis_akun",
    "saldo_awal",
    "tanggal_saldo_awal",
    "aktif",
    ...audit,
  ],
  Kategori: [
    "kategori_id",
    "nama_kategori",
    "jenis_yang_diizinkan",
    "kelompok_arus",
    "aktif",
    ...audit,
  ],
  Transaksi: [
    "transaksi_id",
    "operation_id",
    "line_no",
    "tanggal_transaksi",
    "jenis",
    "akun_id",
    "arah",
    "nominal",
    "kategori_id",
    "tagihan_id",
    "program_id_opsional",
    "metode_pembayaran",
    "referensi_eksternal",
    "deskripsi",
    "bukti_url",
    "transaksi_rujukan_id",
    "created_at",
    "created_by",
  ],
  Operasi: [
    "operation_id",
    "request_hash",
    "aksi",
    "entity_type",
    "entity_id",
    "actor_id",
    "committed_at",
    "alasan",
    "before_json",
    "after_json",
    "result_json",
  ],
};
export class DomainError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "VALIDATION", status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const text = (r: Record<string, unknown> | undefined, key: string) =>
  String(r?.[key] ?? "");
export const num = (r: Record<string, unknown> | undefined, key: string) =>
  Number(r?.[key] ?? 0);
export const active = (r: Row) =>
  r.aktif === true || r.aktif === "TRUE" || r.aktif === "true";
export const emptyState = (): State =>
  Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as State;
export function upgradeState(input: State): State {
  // Version 1 backups/demo data keep all original IDs and gain empty report tables.
  const state = structuredClone(input);
  for (const table of ["Pemetaan_Laporan", "Aset", "Saldo_Neraca", "Jurnal_Laporan", "Tarif_Pajak", "Pembayaran_Pajak"] as Table[])
    if (!(table in state)) state[table] = [];
  if (Array.isArray(state.Pengaturan)) {
    const version = state.Pengaturan.find(r => r.key === "schema_version");
    if (version && !["1", "2"].includes(String(version.value))) throw new DomainError("Versi struktur data belum didukung oleh aplikasi ini.", "SCHEMA_VERSION", 409);
    if (version) version.value = "2";
    else state.Pengaturan.push({ key: "schema_version", value: "2" });
  }
  return state;
}
export const setting = (s: State, key: string, fallback = "") =>
  text(
    s.Pengaturan.find((r) => r.key === key),
    "value",
  ) || fallback;
export const money = (n: number) =>
  "Rp" + new Intl.NumberFormat("id-ID").format(n === 0 ? 0 : n);
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T00:00:00Z"));
export function today(timezone = "Asia/Jakarta") {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => p.find((v) => v.type === k)?.value)
    .join("-");
}
export function endOfMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
export function dueDate(month: string, day: number) {
  return `${month}-${String(Math.min(day, Number(endOfMonth(month).slice(8)))).padStart(2, "0")}`;
}
export function validDate(value: unknown) {
  const v = String(value || "");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v + "T00:00:00Z")) ||
    new Date(v + "T00:00:00Z").toISOString().slice(0, 10) !== v
  )
    throw new DomainError("Tanggal tidak valid.");
  return v;
}
function amount(value: unknown, zero = false) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < (zero ? 0 : 1) || n > 1000000000000)
    throw new DomainError("Nominal harus berupa rupiah bulat yang valid.");
  return n;
}
function required(value: unknown, label: string, max = 150) {
  const v = String(value ?? "").trim();
  if (!v || v.length > max)
    throw new DomainError(`${label} wajib diisi (maksimal ${max} karakter).`);
  return v;
}
function found(s: State, table: Table, id: unknown) {
  const r = s[table].find((x) => String(x[KEYS[table]]) === String(id));
  if (!r) throw new DomainError(`${table}: data yang dipilih tidak ditemukan.`);
  return r;
}
function assertOpen(s: State, date: string) {
  const months = JSON.parse(setting(s, "closed_periods", "[]")) as string[];
  if (months.includes(date.slice(0, 7)))
    throw new DomainError(
      "Periode ini sudah ditutup. Pemilik perlu membukanya kembali.",
      "PERIOD_CLOSED",
      409,
    );
}
function setSetting(
  s: State,
  key: string,
  value: string,
  actor: Actor,
  now: string,
) {
  const row = s.Pengaturan.find((r) => r.key === key);
  if (row) Object.assign(row, { value, updated_at: now, updated_by: actor.id });
  else s.Pengaturan.push({ key, value, updated_at: now, updated_by: actor.id });
}
export function baseTransaction(s: State, t: Row) {
  return t.jenis === "PEMBALIK"
    ? found(s, "Transaksi", t.transaksi_rujukan_id)
    : t;
}
const incomingKinds = [
  "PEMBAYARAN_SISWA",
  "PENERIMAAN_LAIN",
  "MODAL_MASUK",
  "PINJAMAN_MASUK",
];
const outgoingKinds = [
  "BIAYA",
  "REFUND_SISWA",
  "PRIVE",
  "POKOK_PINJAMAN_KELUAR",
];
export function invoiceSummary(s: State, invoice: Row, asOf = "9999-12-31") {
  const adjustments = s.Penyesuaian_Tagihan.filter(
    (a) =>
      a.tagihan_id === invoice.tagihan_id && text(a, "tanggal_efektif") <= asOf,
  );
  const reduction = adjustments.reduce(
    (sum, a) => sum + num(a, "nominal") * (a.jenis === "PEMBALIK" ? -1 : 1),
    0,
  );
  const paid = s.Transaksi.filter(
    (t) =>
      t.tagihan_id === invoice.tagihan_id &&
      text(t, "tanggal_transaksi") <= asOf,
  ).reduce((sum, t) => {
    const base = baseTransaction(s, t);
    const sign = t.jenis === "PEMBALIK" ? -1 : 1;
    return (
      sum +
      (base.jenis === "PEMBAYARAN_SISWA"
        ? 1
        : base.jenis === "REFUND_SISWA"
          ? -1
          : 0) *
        num(t, "nominal") *
        sign
    );
  }, 0);
  const face =
    num(invoice, "nominal_dasar") - num(invoice, "diskon_awal") - reduction;
  const schedules = s.Jadwal_Tagihan.filter(
    (j) => j.tagihan_id === invoice.tagihan_id,
  )
    .sort(
      (a, b) =>
        text(a, "jatuh_tempo").localeCompare(text(b, "jatuh_tempo")) ||
        num(a, "urutan") - num(b, "urutan"),
    )
    .map((j) => ({ ...j, effective: num(j, "nominal"), remaining: 0 }));
  let credit = reduction;
  for (let i = schedules.length - 1; i >= 0; i--) {
    const cut = Math.min(schedules[i].effective, credit);
    schedules[i].effective -= cut;
    credit -= cut;
  }
  let allocation = paid;
  for (const j of schedules) {
    const used = Math.min(j.effective, Math.max(0, allocation));
    j.remaining = j.effective - used;
    allocation -= used;
  }
  const cancelled = adjustments.some(
    (a) =>
      a.jenis === "PEMBATALAN" &&
      !adjustments.some(
        (b) =>
          b.jenis === "PEMBALIK" &&
          b.penyesuaian_rujukan_id === a.penyesuaian_id,
      ),
  );
  return {
    face,
    paid,
    remaining: Math.max(0, face - paid),
    credit: Math.max(0, paid - face),
    overdue: schedules
      .filter((j) => text(j, "jatuh_tempo") < asOf)
      .reduce((sum, j) => sum + j.remaining, 0),
    schedules,
    cancelled,
  };
}
export function finance(s: State, from: string, to: string, accountId = "") {
  let incoming = 0,
    outgoing = 0,
    operational = 0;
  const accounts = s.Akun.filter(
    (a) => !accountId || a.akun_id === accountId,
  ).map((a) => {
    const opened = text(a, "tanggal_saldo_awal");
    const available = to >= opened;
    const tx = s.Transaksi.filter(
      (t) =>
        t.akun_id === a.akun_id &&
        text(t, "tanggal_transaksi") >= opened &&
        text(t, "tanggal_transaksi") <= to,
    );
    const delta = (t: Row) => num(t, "nominal") * (t.arah === "IN" ? 1 : -1);
    return {
      ...a,
      available,
      opening: available
        ? num(a, "saldo_awal") +
          tx
            .filter((t) => text(t, "tanggal_transaksi") < from)
            .reduce((sum, t) => sum + delta(t), 0)
        : null,
      balance: available
        ? num(a, "saldo_awal") + tx.reduce((sum, t) => sum + delta(t), 0)
        : null,
    } as Row & {
      available: boolean;
      opening: number | null;
      balance: number | null;
    };
  });
  const transactions = s.Transaksi.filter(
    (t) =>
      text(t, "tanggal_transaksi") >= from &&
      text(t, "tanggal_transaksi") <= to &&
      (!accountId || t.akun_id === accountId),
  );
  for (const t of transactions) {
    const base = baseTransaction(s, t),
      kind = text(base, "jenis"),
      v = num(t, "nominal") * (t.jenis === "PEMBALIK" ? -1 : 1);
    if (incomingKinds.includes(kind)) incoming += v;
    if (outgoingKinds.includes(kind)) outgoing += v;
    if (["PEMBAYARAN_SISWA", "PENERIMAAN_LAIN"].includes(kind))
      operational += v;
    if (["BIAYA", "REFUND_SISWA"].includes(kind)) operational -= v;
  }
  const bills = s.Tagihan.filter((i) => text(i, "tanggal_terbit") <= to).map(
    (i) => ({ invoice: i, ...invoiceSummary(s, i, to) }),
  );
  return {
    accounts,
    balance: accounts.every((a) => a.available)
      ? accounts.reduce((sum, a) => sum + (a.balance || 0), 0)
      : null,
    opening: accounts.every((a) => a.available)
      ? accounts.reduce((sum, a) => sum + (a.opening || 0), 0)
      : null,
    incoming,
    outgoing,
    operational,
    outstanding: bills.reduce((sum, b) => sum + b.remaining, 0),
    overdue: bills.reduce((sum, b) => sum + b.overdue, 0),
    credit: bills.reduce((sum, b) => sum + b.credit, 0),
    transactions,
    bills,
  };
}
export type Reconciliation = { month: string; checkedAt: string; checkedBy: string; note: string; accounts: { akun_id: string; nama_akun: string; expected: number; actual: number; difference: number }[] };
export function reconciliationFor(s: State, month: string): Reconciliation | null {
  try {
    const value = JSON.parse(setting(s, `reconciliation:${month}`, "null"));
    if (!value || value.month !== month || typeof value.checkedAt !== "string" || typeof value.checkedBy !== "string" || typeof value.note !== "string" || !Array.isArray(value.accounts) || !value.accounts.length) return null;
    if (!value.accounts.every((a: Reconciliation["accounts"][number]) => typeof a.akun_id === "string" && typeof a.nama_akun === "string" && [a.expected, a.actual, a.difference].every(Number.isSafeInteger) && a.difference === a.actual - a.expected)) return null;
    return value as Reconciliation;
  } catch { return null; }
}
export function reconcileAccounts(s: State, month: string, balances: unknown) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new DomainError("Bulan tidak valid.");
  if (!Array.isArray(balances)) throw new DomainError("Isi saldo nyata setiap akun kas dan bank.");
  const accounts = finance(s, month + "-01", endOfMonth(month)).accounts.filter(a => a.available);
  if (!accounts.length) throw new DomainError("Belum ada akun pada akhir bulan yang dipilih.");
  const ids = balances.map(b => String(b?.akun_id || ""));
  if (balances.length !== accounts.length || new Set(ids).size !== ids.length || ids.some(id => !accounts.some(a => a.akun_id === id)))
    throw new DomainError("Saldo nyata harus mencakup setiap akun tepat satu kali.");
  return accounts.map(account => {
    const value = balances.find(b => b.akun_id === account.akun_id)?.nominal;
    if (value === "" || value === null || value === undefined || typeof value === "boolean" || !Number.isSafeInteger(Number(value)) || Math.abs(Number(value)) > 1000000000000)
      throw new DomainError("Saldo nyata harus berupa rupiah utuh untuk setiap akun.");
    const actual = Number(value), expected = account.balance!;
    return { akun_id: text(account, "akun_id"), nama_akun: text(account, "nama_akun"), expected, actual, difference: actual - expected };
  });
}

export function validateState(s: State) {
  for (const table of TABLES) {
    if (!Array.isArray(s[table])) throw new DomainError("Tabel " + table + " tidak valid.", "DATA_INTEGRITY", 409);
    const keys = s[table].map((r) => text(r, KEYS[table]));
    if (keys.some((k) => !k) || new Set(keys).size !== keys.length)
      throw new DomainError(
        `ID kosong atau ganda pada ${table}. Periksa spreadsheet.`,
        "DATA_INTEGRITY",
        409,
      );
  }
  if (!["1", "2"].includes(setting(s, "schema_version", "1"))) throw new DomainError("Versi struktur data belum didukung oleh aplikasi ini.", "SCHEMA_VERSION", 409);
  try {
    const closed = JSON.parse(setting(s, "closed_periods", "[]"));
    if (
      !Array.isArray(closed) ||
      closed.some(
        (m) => typeof m !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m),
      )
    )
      throw new Error();
  } catch {
    throw new DomainError(
      "Daftar periode tertutup tidak valid.",
      "DATA_INTEGRITY",
      409,
    );
  }
  for (const a of s.Akun) {
    amount(a.saldo_awal, true);
    validDate(a.tanggal_saldo_awal);
  }
  for (const r of s.Pengaturan.filter(r => text(r, "key").startsWith("reconciliation:")))
    if (!reconciliationFor(s, text(r, "key").slice(15))) throw new DomainError("Catatan pencocokan saldo tidak valid.", "DATA_INTEGRITY", 409);
  for (const p of s.Pendaftaran) {
    found(s, "Siswa", p.siswa_id);
    found(s, "Program", p.program_id);
  }
  const businessKeys = new Set<string>();
  for (const i of s.Tagihan) {
    found(s, "Pendaftaran", i.pendaftaran_id);
    amount(i.nominal_dasar, true);
    amount(i.diskon_awal, true);
    const sum = invoiceSummary(s, i);
    if (
      sum.face < 0 ||
      sum.face > num(i, "nominal_dasar") - num(i, "diskon_awal") ||
      sum.paid < 0
    )
      throw new DomainError(
        "Nilai tagihan atau pembayaran bersih tidak valid.",
        "DATA_INTEGRITY",
        409,
      );
    const stages = s.Jadwal_Tagihan.filter(
      (j) => j.tagihan_id === i.tagihan_id,
    );
    if (
      !stages.length ||
      stages.reduce((v, j) => v + num(j, "nominal"), 0) !==
        num(i, "nominal_dasar") - num(i, "diskon_awal")
    )
      throw new DomainError(
        "Jumlah jadwal tagihan tidak cocok.",
        "DATA_INTEGRITY",
        409,
      );
    const key = [i.pendaftaran_id, i.jenis_tagihan, i.periode_layanan].join(
      ":",
    );
    if (!sum.cancelled) {
      if (businessKeys.has(key))
        throw new DomainError(
          "Ada kewajiban ganda pada pendaftaran yang sama.",
          "DATA_INTEGRITY",
          409,
        );
      businessKeys.add(key);
    }
  }
  for (const j of s.Jadwal_Tagihan) {
    found(s, "Tagihan", j.tagihan_id);
    validDate(j.jatuh_tempo);
    amount(j.nominal, true);
  }
  for (const a of s.Penyesuaian_Tagihan) {
    found(s, "Tagihan", a.tagihan_id);
    validDate(a.tanggal_efektif);
    amount(a.nominal);
    if (!["PENGURANGAN", "PEMBATALAN", "PEMBALIK"].includes(text(a, "jenis")))
      throw new DomainError(
        "Jenis penyesuaian tidak valid.",
        "DATA_INTEGRITY",
        409,
      );
    if (a.jenis === "PEMBALIK")
      found(s, "Penyesuaian_Tagihan", a.penyesuaian_rujukan_id);
  }
  const logicalLines = new Set<string>();
  const reversed = new Set<string>();
  const transfers = new Map<string, Row[]>();
  for (const t of s.Transaksi) {
    const account = found(s, "Akun", t.akun_id);
    amount(t.nominal);
    validDate(t.tanggal_transaksi);
    if (text(t, "tanggal_transaksi") < text(account, "tanggal_saldo_awal"))
      throw new DomainError(
        "Transaksi mendahului tanggal saldo awal akun.",
        "DATA_INTEGRITY",
        409,
      );
    const line = t.operation_id + ":" + t.line_no;
    if (logicalLines.has(line))
      throw new DomainError(
        "Baris operasi transaksi ganda.",
        "DATA_INTEGRITY",
        409,
      );
    logicalLines.add(line);
    if (
      ![
        ...incomingKinds,
        ...outgoingKinds,
        "TRANSFER_MASUK",
        "TRANSFER_KELUAR",
        "PEMBALIK",
      ].includes(text(t, "jenis")) ||
      !["IN", "OUT"].includes(text(t, "arah"))
    )
      throw new DomainError(
        "Jenis / arah transaksi tidak valid.",
        "DATA_INTEGRITY",
        409,
      );
    if (t.tagihan_id) found(s, "Tagihan", t.tagihan_id);
    if (t.kategori_id) found(s, "Kategori", t.kategori_id);
    const kind = text(t, "jenis");
    if (
      ((incomingKinds.includes(kind) || kind === "TRANSFER_MASUK") &&
        t.arah !== "IN") ||
      ((outgoingKinds.includes(kind) || kind === "TRANSFER_KELUAR") &&
        t.arah !== "OUT")
    )
      throw new DomainError(
        "Arah transaksi tidak sesuai jenisnya.",
        "DATA_INTEGRITY",
        409,
      );
    if (kind.startsWith("TRANSFER_")) {
      const group = text(t, "operation_id");
      transfers.set(group, [...(transfers.get(group) || []), t]);
    }
    if (t.jenis === "PEMBALIK") {
      const original = found(s, "Transaksi", t.transaksi_rujukan_id);
      if (
        original.akun_id !== t.akun_id ||
        original.arah === t.arah ||
        num(original, "nominal") !== num(t, "nominal") ||
        text(original, "tagihan_id") !== text(t, "tagihan_id") ||
        text(t, "tanggal_transaksi") < text(original, "tanggal_transaksi") ||
        reversed.has(text(original, "transaksi_id"))
      )
        throw new DomainError(
          "Pembalik tidak sesuai transaksi asal atau berulang.",
          "DATA_INTEGRITY",
          409,
        );
      reversed.add(text(original, "transaksi_id"));
      if (original.jenis === "PEMBALIK")
        throw new DomainError(
          "Pembalik tidak boleh berantai.",
          "DATA_INTEGRITY",
          409,
        );
    }
  }
  for (const group of transfers.values())
    if (
      group.length !== 2 ||
      group[0].arah === group[1].arah ||
      group[0].akun_id === group[1].akun_id ||
      num(group[0], "nominal") !== num(group[1], "nominal") ||
      group[0].tanggal_transaksi !== group[1].tanggal_transaksi
    )
      throw new DomainError(
        "Transfer harus memiliki dua sisi yang seimbang.",
        "DATA_INTEGRITY",
        409,
      );
  validateReportState(s);
  // Leave headroom for differences between two cumulative report snapshots.
  const moneyFields: Partial<Record<Table, string[]>> = {
    Akun: ["saldo_awal"], Transaksi: ["nominal"], Tagihan: ["nominal_dasar", "diskon_awal"],
    Jadwal_Tagihan: ["nominal"], Penyesuaian_Tagihan: ["nominal"],
    Aset: ["harga_perolehan", "nilai_residu", "akumulasi_awal"],
    Saldo_Neraca: ["debit", "kredit"], Jurnal_Laporan: ["debit", "kredit"],
  };
  let exposure = 0n;
  for (const [table, fields] of Object.entries(moneyFields)) for (const row of s[table as Table]) for (const field of fields) {
    const value = num(row, field);
    if (!Number.isSafeInteger(value)) throw new DomainError("Nominal tidak dapat dihitung secara tepat.", "DATA_INTEGRITY", 409);
    exposure += BigInt(Math.abs(value));
  }
  if (exposure > BigInt(Number.MAX_SAFE_INTEGER) / 2n) throw new DomainError("Total nominal melampaui batas perhitungan rupiah yang aman. Arsipkan atau migrasikan data sebelum melanjutkan.", "CAPACITY", 409);
}
export function applyCommand(
  input: State,
  command: Command,
  actor: Actor,
  now = new Date().toISOString(),
): { state: State; result: Row } {
  if (actor.role === "VIEWER")
    throw new DomainError(
      "Akun pembaca tidak dapat mengubah data.",
      "FORBIDDEN",
      403,
    );
  if (input.Operasi.some((o) => o.operation_id === command.operationId))
    return {
      state: input,
      result: JSON.parse(
        text(
          input.Operasi.find((o) => o.operation_id === command.operationId),
          "result_json",
        ) || "{}",
      ) as Row,
    };
  const s = structuredClone(input),
    d = command.data,
    owner = actor.role === "OWNER";
  let count = 0;
  let result: Row = {};
  const id = (prefix: string) => `${prefix}_${command.operationId}_${++count}`;
  const stamp = () => ({
    created_at: now,
    created_by: actor.id,
    updated_at: now,
    updated_by: actor.id,
  });
  const onlyOwner = () => {
    if (!owner)
      throw new DomainError(
        "Tindakan ini hanya untuk pemilik.",
        "FORBIDDEN",
        403,
      );
  };
  const transaction = (fields: Row) => {
    const date = validDate(fields.tanggal_transaksi);
    assertOpen(s, date);
    const account = found(s, "Akun", fields.akun_id);
    if (!active(account)) throw new DomainError("Akun sudah nonaktif.");
    if (date < text(account, "tanggal_saldo_awal"))
      throw new DomainError("Tanggal transaksi mendahului saldo awal akun.");
    const value = amount(fields.nominal);
    if (
      fields.arah === "OUT" &&
      (finance(s, "0001-01-01", date, text(account, "akun_id")).balance ?? 0) <
        value &&
      !(owner && String(d.alasan || "").trim())
    )
      throw new DomainError(
        "Saldo akun tidak cukup. Pemilik dapat menambahkan alasan penyesuaian.",
      );
    const row: Row = {
      transaksi_id: id("TX"),
      operation_id: command.operationId,
      line_no: count,
      created_at: now,
      created_by: actor.id,
      ...fields,
      nominal: value,
    };
    s.Transaksi.push(row);
    result = { id: row.transaksi_id };
    return row;
  };
  const adjust = (
    invoice: Row,
    kind: string,
    value: number,
    reason: string,
    date: string,
  ) => {
    onlyOwner();
    assertOpen(s, date);
    if (date < text(invoice, "tanggal_terbit"))
      throw new DomainError("Penyesuaian mendahului penerbitan tagihan.");
    const current = invoiceSummary(s, invoice);
    if (value > current.face)
      throw new DomainError(
        "Pengurangan melampaui kewajiban yang masih berlaku.",
      );
    if (kind === "PEMBATALAN" && value !== current.face)
      throw new DomainError(
        "Pembatalan penuh harus menghapus seluruh kewajiban yang masih berlaku.",
      );
    s.Penyesuaian_Tagihan.push({
      penyesuaian_id: id("ADJ"),
      tagihan_id: text(invoice, "tagihan_id"),
      tanggal_efektif: date,
      jenis: kind,
      nominal: value,
      alasan: required(reason, "Alasan", 500),
      operation_id: command.operationId,
    });
  };
  const issue = (
    enrollment: Row,
    period: string,
    issueDate: string,
    discount: number,
    schedule?: { date: string; amount: number }[],
  ) => {
    if (enrollment.status !== "AKTIF")
      throw new DomainError("Pendaftaran tidak aktif.");
    assertOpen(s, issueDate);
    const scheme = text(enrollment, "skema_biaya");
    if (scheme === "PAKET") period = "";
    if (
      scheme === "BULANAN" &&
      (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
        period < text(enrollment, "tanggal_mulai").slice(0, 7) ||
        (enrollment.tanggal_selesai &&
          period > text(enrollment, "tanggal_selesai").slice(0, 7)))
    )
      throw new DomainError("Bulan layanan di luar rentang pendaftaran.");
    if (
      s.Tagihan.some(
        (i) =>
          i.pendaftaran_id === enrollment.pendaftaran_id &&
          i.jenis_tagihan === scheme &&
          text(i, "periode_layanan") === period &&
          !invoiceSummary(s, i).cancelled,
      )
    )
      throw new DomainError(
        "Tagihan untuk pendaftaran dan periode ini sudah ada.",
        "DUPLICATE_INVOICE",
        409,
      );
    const base = amount(enrollment.tarif_disepakati, true);
    if (discount > 0) onlyOwner();
    if (discount > base)
      throw new DomainError("Diskon melebihi nilai tagihan.");
    const invoiceId = id("INV"),
      face = base - discount;
    const stages = schedule || [
      {
        date:
          scheme === "BULANAN"
            ? dueDate(period, num(enrollment, "hari_jatuh_tempo"))
            : issueDate,
        amount: face,
      },
    ];
    if (
      !stages.length ||
      stages.length > 24 ||
      stages.reduce((sum, j) => sum + amount(j.amount, true), 0) !== face
    )
      throw new DomainError(
        "Jumlah seluruh jadwal cicilan harus sama dengan nilai tagihan.",
      );
    stages.forEach((j) => validDate(j.date));
    const invoice = {
      tagihan_id: invoiceId,
      nomor_tagihan: `INV-${issueDate.slice(0, 7).replace("-", "")}-${command.operationId.slice(0, 8)}-${count}`,
      pendaftaran_id: text(enrollment, "pendaftaran_id"),
      jenis_tagihan: scheme,
      periode_layanan: period,
      tanggal_terbit: issueDate,
      nominal_dasar: base,
      diskon_awal: discount,
      operation_id: command.operationId,
      ...stamp(),
    };
    s.Tagihan.push(invoice);
    stages.forEach((j, i) =>
      s.Jadwal_Tagihan.push({
        jadwal_id: id("JAD"),
        tagihan_id: invoiceId,
        urutan: i + 1,
        jatuh_tempo: j.date,
        nominal: j.amount,
        operation_id: command.operationId,
      }),
    );
    result = { id: invoiceId };
    return invoice;
  };
  switch (command.action) {
    case "student.save": {
      const values: Row = {
        nama: required(d.nama, "Nama siswa"),
        no_wa: String(d.no_wa || "").slice(0, 30),
        nama_wali: String(d.nama_wali || "").slice(0, 150),
        no_wa_wali: String(d.no_wa_wali || "").slice(0, 30),
        catatan: String(d.catatan || "").slice(0, 500),
        aktif: d.aktif !== false,
      };
      if (d.id)
        Object.assign(found(s, "Siswa", d.id), values, {
          updated_at: now,
          updated_by: actor.id,
        });
      else {
        const row = {
          siswa_id: id("SIS"),
          tanggal_daftar: validDate(d.tanggal_daftar),
          ...values,
          ...stamp(),
        };
        s.Siswa.push(row);
        result = { id: row.siswa_id };
      }
      break;
    }
    case "enrollment.save": {
      found(s, "Siswa", d.siswa_id);
      const program = found(s, "Program", d.program_id);
      if (!active(program)) throw new DomainError("Program nonaktif.");
      const start = validDate(d.tanggal_mulai),
        end = d.tanggal_selesai ? validDate(d.tanggal_selesai) : "";
      if (end && end < start)
        throw new DomainError("Tanggal selesai mendahului tanggal mulai.");
      const scheme = String(d.skema_biaya || program.skema_default);
      if (!["PAKET", "BULANAN"].includes(scheme))
        throw new DomainError("Skema biaya tidak valid.");
      const day = Number(d.hari_jatuh_tempo || 5);
      if (!Number.isInteger(day) || day < 1 || day > 31)
        throw new DomainError("Hari jatuh tempo harus 1–31.");
      const values = {
        siswa_id: String(d.siswa_id),
        program_id: String(d.program_id),
        angkatan: String(d.angkatan || "").slice(0, 100),
        tanggal_mulai: start,
        tanggal_selesai: end,
        skema_biaya: scheme,
        tarif_disepakati: amount(d.tarif_disepakati, true),
        hari_jatuh_tempo: day,
        status: String(d.status || "AKTIF"),
      };
      const oldEnrollment = d.id ? found(s, "Pendaftaran", d.id) : undefined;
      if (
        !owner &&
        values.tarif_disepakati !== num(program, "tarif_default") &&
        (!oldEnrollment ||
          values.tarif_disepakati !== num(oldEnrollment, "tarif_disepakati"))
      )
        throw new DomainError(
          "Tarif khusus hanya dapat disetujui pemilik.",
          "FORBIDDEN",
          403,
        );
      if (!["AKTIF", "CUTI", "SELESAI", "BERHENTI"].includes(values.status))
        throw new DomainError("Status pendaftaran tidak valid.");
      if (d.id)
        Object.assign(found(s, "Pendaftaran", d.id), values, {
          updated_at: now,
          updated_by: actor.id,
        });
      else {
        const row = { pendaftaran_id: id("DAF"), ...values, ...stamp() };
        s.Pendaftaran.push(row);
        result = { id: row.pendaftaran_id };
      }
      break;
    }
    case "invoice.create": {
      issue(
        found(s, "Pendaftaran", d.pendaftaran_id),
        String(d.periode_layanan || ""),
        validDate(d.tanggal_terbit),
        amount(d.diskon_awal || 0, true),
        Array.isArray(d.jadwal)
          ? (d.jadwal as { date: string; amount: number }[])
          : undefined,
      );
      break;
    }
    case "invoice.monthly": {
      const period = required(d.periode_layanan, "Bulan layanan");
      const date = validDate(d.tanggal_terbit);
      const ids = Array.isArray(d.pendaftaran_ids)
        ? d.pendaftaran_ids.map(String)
        : [];
      if (!ids.length || ids.length > 50)
        throw new DomainError("Pilih 1–50 pendaftaran per proses.");
      let created = 0;
      for (const enrollmentId of [...new Set(ids)]) {
        const e = found(s, "Pendaftaran", enrollmentId);
        if (e.skema_biaya !== "BULANAN") continue;
        try {
          issue(e, period, date, 0);
          created++;
        } catch (error) {
          if (
            !(
              error instanceof DomainError && error.code === "DUPLICATE_INVOICE"
            )
          )
            throw error;
        }
      }
      result = { count: created };
      break;
    }
    case "payment.create": {
      const invoice = found(s, "Tagihan", d.tagihan_id),
        value = amount(d.nominal);
      if (
        invoiceSummary(s, invoice).cancelled ||
        value > invoiceSummary(s, invoice).remaining
      )
        throw new DomainError(
          "Pembayaran melebihi sisa tagihan atau tagihan dibatalkan.",
        );
      const date = validDate(d.tanggal_transaksi);
      if (date < text(invoice, "tanggal_terbit"))
        throw new DomainError("Pembayaran mendahului penerbitan tagihan.");
      transaction({
        tanggal_transaksi: date,
        jenis: "PEMBAYARAN_SISWA",
        akun_id: String(d.akun_id),
        arah: "IN",
        nominal: value,
        tagihan_id: text(invoice, "tagihan_id"),
        kategori_id: "",
        metode_pembayaran: String(d.metode_pembayaran || "Transfer"),
        referensi_eksternal: String(d.referensi_eksternal || "").slice(0, 100),
        deskripsi: String(d.deskripsi || "Pembayaran siswa").slice(0, 500),
        bukti_url: validateURL(d.bukti_url),
      });
      break;
    }
    case "transaction.create": {
      const kind = required(d.jenis, "Jenis transaksi");
      if (
        ![
          "PENERIMAAN_LAIN",
          "BIAYA",
          "MODAL_MASUK",
          "PRIVE",
          "PINJAMAN_MASUK",
          "POKOK_PINJAMAN_KELUAR",
        ].includes(kind)
      )
        throw new DomainError(
          "Gunakan alur pembayaran atau transfer untuk jenis ini.",
        );
      if (d.kategori_id) {
        const category = found(s, "Kategori", d.kategori_id);
        if (
          !active(category) ||
          !text(category, "jenis_yang_diizinkan").split(",").includes(kind)
        )
          throw new DomainError("Kategori tidak sesuai jenis transaksi.");
      }
      transaction({
        tanggal_transaksi: validDate(d.tanggal_transaksi),
        jenis: kind,
        akun_id: String(d.akun_id),
        arah: incomingKinds.includes(kind) ? "IN" : "OUT",
        nominal: amount(d.nominal),
        kategori_id: String(d.kategori_id || ""),
        program_id_opsional: String(d.program_id_opsional || ""),
        deskripsi: required(d.deskripsi, "Keterangan", 500),
        bukti_url: validateURL(d.bukti_url),
        referensi_eksternal: String(d.referensi_eksternal || "").slice(0, 100),
      });
      break;
    }
    case "transfer.create": {
      if (d.dari_akun_id === d.ke_akun_id)
        throw new DomainError("Akun asal dan tujuan harus berbeda.");
      const value = amount(d.nominal),
        date = validDate(d.tanggal_transaksi);
      transaction({
        tanggal_transaksi: date,
        jenis: "TRANSFER_KELUAR",
        akun_id: String(d.dari_akun_id),
        arah: "OUT",
        nominal: value,
        deskripsi: String(d.deskripsi || "Transfer antar akun"),
      });
      transaction({
        tanggal_transaksi: date,
        jenis: "TRANSFER_MASUK",
        akun_id: String(d.ke_akun_id),
        arah: "IN",
        nominal: value,
        deskripsi: String(d.deskripsi || "Transfer antar akun"),
      });
      break;
    }
    case "transaction.reverse": {
      onlyOwner();
      const original = found(s, "Transaksi", d.transaksi_id);
      required(d.alasan, "Alasan", 500);
      const date = validDate(d.tanggal_transaksi);
      if (original.jenis === "PEMBALIK")
        throw new DomainError(
          "Pembalik tidak dapat dibalik lagi. Buat pencatatan pengganti.",
        );
      if (date < text(original, "tanggal_transaksi"))
        throw new DomainError("Tanggal pembalik mendahului transaksi asal.");
      const originals = text(original, "jenis").startsWith("TRANSFER_")
        ? s.Transaksi.filter(
            (t) =>
              t.operation_id === original.operation_id &&
              text(t, "jenis").startsWith("TRANSFER_"),
          )
        : [original];
      for (const t of originals) {
        if (
          s.Transaksi.some(
            (x) =>
              x.jenis === "PEMBALIK" &&
              x.transaksi_rujukan_id === t.transaksi_id,
          )
        )
          throw new DomainError("Transaksi sudah pernah dibalik.");
        transaction({
          ...t,
          transaksi_id: id("TX"),
          operation_id: command.operationId,
          line_no: count,
          tanggal_transaksi: date,
          jenis: "PEMBALIK",
          arah: t.arah === "IN" ? "OUT" : "IN",
          transaksi_rujukan_id: text(t, "transaksi_id"),
          deskripsi: `Koreksi: ${required(d.alasan, "Alasan", 500)}`,
          created_at: now,
          created_by: actor.id,
        });
      }
      break;
    }
    case "invoice.adjust": {
      const invoice = found(s, "Tagihan", d.tagihan_id);
      adjust(
        invoice,
        d.batalkan ? "PEMBATALAN" : "PENGURANGAN",
        amount(d.nominal),
        String(d.alasan || ""),
        validDate(d.tanggal_efektif),
      );
      result = { id: text(invoice, "tagihan_id") };
      break;
    }
    case "invoice.adjust.reverse": {
      onlyOwner();
      const original = found(s, "Penyesuaian_Tagihan", d.penyesuaian_id),
        date = validDate(d.tanggal_efektif);
      assertOpen(s, date);
      if (
        original.jenis === "PEMBALIK" ||
        s.Penyesuaian_Tagihan.some(
          (a) =>
            a.jenis === "PEMBALIK" &&
            a.penyesuaian_rujukan_id === original.penyesuaian_id,
        )
      )
        throw new DomainError(
          "Penyesuaian sudah dibalik atau merupakan pembalik.",
        );
      if (date < text(original, "tanggal_efektif"))
        throw new DomainError("Tanggal pembalik mendahului penyesuaian.");
      s.Penyesuaian_Tagihan.push({
        penyesuaian_id: id("ADJ"),
        tagihan_id: text(original, "tagihan_id"),
        tanggal_efektif: date,
        jenis: "PEMBALIK",
        nominal: num(original, "nominal"),
        penyesuaian_rujukan_id: text(original, "penyesuaian_id"),
        alasan: required(d.alasan, "Alasan", 500),
        operation_id: command.operationId,
      });
      break;
    }
    case "invoice.refund": {
      onlyOwner();
      const invoice = found(s, "Tagihan", d.tagihan_id),
        receipt = found(s, "Transaksi", d.transaksi_rujukan_id);
      const value = amount(d.nominal),
        date = validDate(d.tanggal_transaksi);
      if (
        receipt.jenis !== "PEMBAYARAN_SISWA" ||
        receipt.tagihan_id !== invoice.tagihan_id
      )
        throw new DomainError("Pilih pembayaran asal untuk tagihan ini.");
      if (date < text(receipt, "tanggal_transaksi"))
        throw new DomainError("Refund mendahului pembayaran asal.");
      const already = s.Transaksi.filter(
        (t) =>
          t.transaksi_rujukan_id === receipt.transaksi_id &&
          t.jenis === "REFUND_SISWA",
      ).reduce(
        (sum, t) =>
          sum +
          num(t, "nominal") *
            (s.Transaksi.some(
              (r) =>
                r.jenis === "PEMBALIK" &&
                r.transaksi_rujukan_id === t.transaksi_id,
            )
              ? 0
              : 1),
        0,
      );
      if (
        s.Transaksi.some(
          (t) =>
            t.jenis === "PEMBALIK" &&
            t.transaksi_rujukan_id === receipt.transaksi_id,
        ) ||
        value > num(receipt, "nominal") - already ||
        value > invoiceSummary(s, invoice).paid
      )
        throw new DomainError(
          "Refund melebihi pembayaran yang dapat dikembalikan.",
        );
      const reduction = amount(d.pengurangan || 0, true);
      if (reduction)
        adjust(
          invoice,
          d.batalkan ? "PEMBATALAN" : "PENGURANGAN",
          reduction,
          String(d.alasan || ""),
          date,
        );
      transaction({
        tanggal_transaksi: date,
        jenis: "REFUND_SISWA",
        akun_id: String(d.akun_id),
        arah: "OUT",
        nominal: value,
        tagihan_id: text(invoice, "tagihan_id"),
        transaksi_rujukan_id: text(receipt, "transaksi_id"),
        deskripsi: required(d.alasan, "Alasan", 500),
      });
      break;
    }
    case "master.save": {
      onlyOwner();
      const table = String(d.table) as Table;
      if (!["Akun", "Kategori", "Program"].includes(table))
        throw new DomainError("Master tidak diizinkan.");
      const key = KEYS[table],
        existing = d.id ? found(s, table, d.id) : undefined;
      let values: Row;
      if (table === "Akun") {
        const kind = required(d.jenis_akun, "Jenis akun");
        if (!["KAS", "BANK", "EWALLET"].includes(kind))
          throw new DomainError("Jenis akun tidak valid.");
        const balance = amount(d.saldo_awal, true),
          date = validDate(d.tanggal_saldo_awal);
        if (!existing || balance !== num(existing, "saldo_awal") || date !== text(existing, "tanggal_saldo_awal")) {
          const affected = [date, existing ? text(existing, "tanggal_saldo_awal") : date].sort()[0];
          if ((JSON.parse(setting(s, "closed_periods", "[]")) as string[]).some(m => m >= affected.slice(0, 7)))
            throw new DomainError("Saldo awal akun memengaruhi periode yang ditutup. Buka kembali periode terkait terlebih dahulu.", "PERIOD_CLOSED", 409);
        }
        if (
          existing &&
          s.Transaksi.some((t) => t.akun_id === existing.akun_id) &&
          (balance !== num(existing, "saldo_awal") ||
            date !== text(existing, "tanggal_saldo_awal"))
        )
          throw new DomainError(
            "Saldo awal akun yang sudah dipakai tidak dapat diubah.",
          );
        values = {
          nama_akun: required(d.nama_akun, "Nama akun"),
          jenis_akun: kind,
          saldo_awal: balance,
          tanggal_saldo_awal: date,
        };
      } else if (table === "Program") {
        const scheme = required(d.skema_default, "Skema biaya");
        if (!["PAKET", "BULANAN"].includes(scheme))
          throw new DomainError("Skema biaya tidak valid.");
        values = {
          nama_program: required(d.nama_program, "Nama program"),
          target_seleksi: required(d.target_seleksi, "Target seleksi"),
          skema_default: scheme,
          tarif_default: amount(d.tarif_default, true),
        };
      } else {
        const kinds = required(d.jenis_yang_diizinkan, "Jenis transaksi");
        if (
          kinds
            .split(",")
            .some((k) => ![...incomingKinds, ...outgoingKinds].includes(k))
        )
          throw new DomainError("Jenis kategori tidak valid.");
        values = {
          nama_kategori: required(d.nama_kategori, "Nama kategori"),
          jenis_yang_diizinkan: kinds,
          kelompok_arus: String(d.kelompok_arus || "OPERASIONAL"),
        };
      }
      values.aktif = d.aktif !== false;
      if (existing)
        Object.assign(existing, values, {
          updated_at: now,
          updated_by: actor.id,
        });
      else {
        const row: Row = { [key]: id(table), ...values, ...stamp() };
        s[table].push(row);
        result = { id: row[key] };
      }
      break;
    }
    case "settings.save": {
      onlyOwner();
      setSetting(
        s,
        "business_name",
        required(d.business_name, "Nama usaha"),
        actor,
        now,
      );
      const tz = String(d.timezone);
      if (!["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"].includes(tz))
        throw new DomainError("Zona waktu tidak valid.");
      if (s.Transaksi.length && tz !== setting(s, "timezone", "Asia/Jakarta"))
        throw new DomainError("Zona waktu dikunci setelah pencatatan dimulai.");
      setSetting(s, "timezone", tz, actor, now);
      break;
    }
    case "user.save": {
      onlyOwner();
      const email = required(d.email, "Email").toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new DomainError("Email tidak valid.");
      const role = String(d.role);
      if (!["OWNER", "ADMIN", "VIEWER"].includes(role))
        throw new DomainError("Peran tidak valid.");
      const user = s.Pengguna.find(
        (u) => text(u, "email").toLowerCase() === email,
      );
      const values = {
        email,
        nama: required(d.nama, "Nama"),
        role,
        aktif: d.aktif !== false,
      };
      if (user)
        Object.assign(user, values, { updated_at: now, updated_by: actor.id });
      else
        s.Pengguna.push({
          user_id: id("USR"),
          google_sub: "",
          ...values,
          ...stamp(),
        });
      if (!s.Pengguna.some((u) => u.role === "OWNER" && active(u)))
        throw new DomainError("Minimal satu OWNER harus tetap aktif.");
      break;
    }
    case "period.reconcile":
    case "period.close":
    case "period.open": {
      onlyOwner();
      const month = required(d.bulan, "Bulan");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new DomainError("Bulan tidak valid.");
      required(d.alasan, "Catatan rekonsiliasi / alasan", 500);
      const closed = JSON.parse(setting(s, "closed_periods", "[]")) as string[];
      if (command.action !== "period.open") {
        assertOpen(s, endOfMonth(month));
        const accounts = reconcileAccounts(s, month, d.saldo_nyata);
        if (command.action === "period.close" && accounts.some(a => a.difference !== 0))
          throw new DomainError("Saldo nyata belum cocok. Simpan hasil pencocokan dan periksa selisih sebelum menutup bulan.");
        setSetting(s, `reconciliation:${month}`, JSON.stringify({ month, accounts, checkedAt: now, checkedBy: actor.id, note: String(d.alasan) }), actor, now);
        result = { matched: accounts.every(a => a.difference === 0), accounts: accounts.length };
        if (command.action === "period.reconcile") break;
      }
      setSetting(
        s,
        "closed_periods",
        JSON.stringify(
          command.action === "period.close"
            ? [...new Set([...closed, month])]
            : closed.filter((m) => m !== month),
        ),
        actor,
        now,
      );
      break;
    }
    default:
      if (command.action.startsWith("report.")) result = applyReportCommand(s, command, actor, now, id);
      else throw new DomainError("Tindakan tidak dikenali.");
  }
  validateState(s);
  const changed = TABLES.filter(
    (t) => t !== "Operasi" && JSON.stringify(input[t]) !== JSON.stringify(s[t]),
  );
  s.Operasi.push({
    operation_id: command.operationId,
    request_hash: "",
    aksi: command.action,
    entity_type: changed.join(","),
    entity_id: text(result, "id"),
    actor_id: actor.id,
    committed_at: now,
    alasan: String(d.alasan || ""),
    before_json: JSON.stringify(
      Object.fromEntries(
        changed.map((t) => [
          t,
          input[t].filter((r) =>
            s[t].some(
              (n) =>
                n[KEYS[t]] === r[KEYS[t]] &&
                JSON.stringify(n) !== JSON.stringify(r),
            ),
          ),
        ]),
      ),
    ),
    after_json: JSON.stringify({
      tables: changed,
      records_added: changed.reduce(
        (sum, t) => sum + s[t].length - input[t].length,
        0,
      ),
    }),
    result_json: JSON.stringify(result),
  });
  return { state: s, result };
}
function validateURL(value: unknown) {
  const v = String(value || "").trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") throw new Error();
  } catch {
    throw new DomainError("Tautan bukti harus berupa URL HTTPS.");
  }
  return v.slice(0, 2000);
}
export function initialState(ownerEmail = OWNER_EMAIL, date = today()): State {
  const s = emptyState();
  s.Pengaturan = [
    { key: "schema_version", value: "2" },
    { key: "business_name", value: "Garda Abdi Negara" },
    { key: "timezone", value: "Asia/Jakarta" },
    { key: "closed_periods", value: "[]" },
  ];
  s.Pengguna.push({
    user_id: "owner-initial",
    google_sub: "",
    email: ownerEmail,
    nama: "Pemilik GAN",
    role: "OWNER",
    aktif: true,
  });
  s.Akun = [
    {
      akun_id: "cash",
      nama_akun: "Kas tunai",
      jenis_akun: "KAS",
      saldo_awal: 0,
      tanggal_saldo_awal: date,
      aktif: true,
    },
    {
      akun_id: "bank",
      nama_akun: "Rekening bank",
      jenis_akun: "BANK",
      saldo_awal: 0,
      tanggal_saldo_awal: date,
      aktif: true,
    },
  ];
  s.Program = [
    {
      program_id: "tni",
      nama_program: "Persiapan TNI",
      target_seleksi: "TNI",
      skema_default: "PAKET",
      tarif_default: 0,
      aktif: true,
    },
    {
      program_id: "kedinasan",
      nama_program: "Sekolah Kedinasan",
      target_seleksi: "KEDINASAN",
      skema_default: "BULANAN",
      tarif_default: 0,
      aktif: true,
    },
  ];
  s.Kategori = [
    {
      kategori_id: "honor",
      nama_kategori: "Honor pengajar",
      jenis_yang_diizinkan: "BIAYA",
      kelompok_arus: "OPERASIONAL",
      aktif: true,
    },
    {
      kategori_id: "operasional",
      nama_kategori: "Operasional kelas",
      jenis_yang_diizinkan: "BIAYA",
      kelompok_arus: "OPERASIONAL",
      aktif: true,
    },
    {
      kategori_id: "sewa",
      nama_kategori: "Sewa tempat",
      jenis_yang_diizinkan: "BIAYA",
      kelompok_arus: "OPERASIONAL",
      aktif: true,
    },
    {
      kategori_id: "lain",
      nama_kategori: "Penerimaan lain",
      jenis_yang_diizinkan: "PENERIMAAN_LAIN",
      kelompok_arus: "OPERASIONAL",
      aktif: true,
    },
  ];
  return s;
}
export function demoState(): State {
  const s = initialState(OWNER_EMAIL, "2026-10-01");
  s.Akun[0].saldo_awal = 1000000;
  s.Akun[1].saldo_awal = 2000000;
  s.Program[0].tarif_default = 1500000;
  s.Program[1].tarif_default = 400000;
  s.Siswa = [
    {
      siswa_id: "rizky",
      nama: "Rizky Pratama",
      no_wa: "",
      nama_wali: "",
      no_wa_wali: "",
      tanggal_daftar: "2026-10-01",
      aktif: true,
      catatan: "Data simulasi",
    },
    {
      siswa_id: "nadia",
      nama: "Nadia Putri",
      no_wa: "",
      nama_wali: "",
      no_wa_wali: "",
      tanggal_daftar: "2026-10-01",
      aktif: true,
      catatan: "Data simulasi",
    },
  ];
  s.Pendaftaran = [
    {
      pendaftaran_id: "daf-rizky",
      siswa_id: "rizky",
      program_id: "tni",
      angkatan: "Oktober 2026",
      tanggal_mulai: "2026-10-01",
      tanggal_selesai: "2026-12-31",
      skema_biaya: "PAKET",
      tarif_disepakati: 1500000,
      hari_jatuh_tempo: 3,
      status: "AKTIF",
    },
    {
      pendaftaran_id: "daf-nadia",
      siswa_id: "nadia",
      program_id: "kedinasan",
      angkatan: "Oktober 2026",
      tanggal_mulai: "2026-10-01",
      tanggal_selesai: "",
      skema_biaya: "BULANAN",
      tarif_disepakati: 400000,
      hari_jatuh_tempo: 5,
      status: "AKTIF",
    },
  ];
  s.Tagihan = [
    {
      tagihan_id: "inv-rizky",
      nomor_tagihan: "INV-202610-001",
      pendaftaran_id: "daf-rizky",
      jenis_tagihan: "PAKET",
      periode_layanan: "",
      tanggal_terbit: "2026-10-03",
      nominal_dasar: 1500000,
      diskon_awal: 0,
      operation_id: "seed-invoice-1",
    },
    {
      tagihan_id: "inv-nadia",
      nomor_tagihan: "INV-202610-002",
      pendaftaran_id: "daf-nadia",
      jenis_tagihan: "BULANAN",
      periode_layanan: "2026-10",
      tanggal_terbit: "2026-10-05",
      nominal_dasar: 400000,
      diskon_awal: 0,
      operation_id: "seed-invoice-2",
    },
  ];
  s.Jadwal_Tagihan = [3, 11, 12].map((m, i) => ({
    jadwal_id: `jad-rizky-${i}`,
    tagihan_id: "inv-rizky",
    urutan: i + 1,
    jatuh_tempo: i === 0 ? "2026-10-03" : `2026-${m}-03`,
    nominal: 500000,
    operation_id: "seed-invoice-1",
  }));
  s.Jadwal_Tagihan.push({
    jadwal_id: "jad-nadia",
    tagihan_id: "inv-nadia",
    urutan: 1,
    jatuh_tempo: "2026-10-05",
    nominal: 400000,
    operation_id: "seed-invoice-2",
  });
  const add = (
    id: string,
    date: string,
    kind: string,
    account: string,
    direction: string,
    value: number,
    description: string,
    extra: Row = {},
  ) =>
    s.Transaksi.push({
      transaksi_id: id,
      operation_id: id.startsWith("transfer") ? "seed-transfer" : "seed-" + id,
      line_no: s.Transaksi.length + 1,
      tanggal_transaksi: date,
      jenis: kind,
      akun_id: account,
      arah: direction,
      nominal: value,
      deskripsi: description,
      created_at: date + "T08:00:00Z",
      created_by: "demo",
      ...extra,
    });
  add(
    "pay-rizky",
    "2026-10-03",
    "PEMBAYARAN_SISWA",
    "cash",
    "IN",
    500000,
    "Cicilan paket TNI",
    { tagihan_id: "inv-rizky" },
  );
  add(
    "pay-nadia",
    "2026-10-06",
    "PEMBAYARAN_SISWA",
    "bank",
    "IN",
    250000,
    "Iuran Oktober · Kedinasan",
    { tagihan_id: "inv-nadia" },
  );
  add(
    "expense-honor",
    "2026-10-07",
    "BIAYA",
    "cash",
    "OUT",
    300000,
    "Honor pengajar",
    { kategori_id: "honor" },
  );
  add(
    "capital",
    "2026-10-08",
    "MODAL_MASUK",
    "bank",
    "IN",
    2000000,
    "Setoran modal pemilik",
  );
  add(
    "transfer-out",
    "2026-10-09",
    "TRANSFER_KELUAR",
    "cash",
    "OUT",
    400000,
    "Transfer ke rekening bank",
  );
  add(
    "transfer-in",
    "2026-10-09",
    "TRANSFER_MASUK",
    "bank",
    "IN",
    400000,
    "Transfer dari kas tunai",
  );
  s.Pengaturan.push(
    { key: "reporting_start", value: "2026-10-01" },
    { key: "reporting_basis", value: "KAS_DISESUAIKAN" },
    { key: "tax_basis", value: "KAS_BRUTO" },
    { key: "report_location", value: "Kab. Gowa" },
    { key: "report_signer", value: "Pengelola (contoh)" },
    { key: "report_position", value: "Direktur" },
  );
  s.Pemetaan_Laporan = [
    ["honor", "BIAYA_JASA"], ["operasional", "BIAYA_LAIN"], ["sewa", "SEWA"], ["lain", "PENDAPATAN_LAIN"],
  ].map(([category, group], i) => ({ pemetaan_id: "demo-map-" + i, kategori_id: category, kelompok: group, berlaku_mulai: "2026-10-01", operation_id: "demo-reporting" }));
  s.Aset.push({ aset_id: "demo-asset", nama_aset: "Peralatan belajar (contoh)", sumber: "SALDO_AWAL", transaksi_id: "", tanggal_perolehan: "2026-09-20", tanggal_mulai: "2026-10-01", tanggal_saldo_awal: "2026-10-01", harga_perolehan: 1200000, umur_bulan: 12, nilai_residu: 0, akumulasi_awal: 0, catatan: "Aset simulasi, tidak diimpor ke data nyata.", operation_id: "demo-reporting" });
  s.Saldo_Neraca = [["KAS_BANK", 3000000, 0], ["ASET_TETAP", 1200000, 0], ["AKUM_PENYUSUTAN", 0, 0], ["MODAL", 0, 4200000]].map(([account, debit, credit], i) => ({ saldo_id: "demo-opening-" + i, versi: 1, tanggal: "2026-10-01", akun_laporan: account, debit, kredit: credit, sumber: "Saldo awal simulasi", operation_id: "demo-reporting" }));
  s.Tarif_Pajak.push({ tarif_id: "demo-tax", berlaku_mulai: "2026-10-01", tarif_basis_poin: 50, catatan: "Tarif simulasi untuk mencoba laporan; bukan penetapan tarif usaha.", operation_id: "demo-reporting" });
  return s;
}
