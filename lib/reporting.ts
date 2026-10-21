import type { Row, State } from "./domain.ts";

// Pure calculations shared by the browser, command validation, and tests.
const t = (r: Record<string, unknown> | undefined, k: string) => String(r?.[k] ?? "");
const n = (r: Record<string, unknown> | undefined, k: string) => Number(r?.[k] ?? 0);
export const REPORT_TABLES = ["Pemetaan_Laporan", "Aset", "Saldo_Neraca", "Jurnal_Laporan", "Tarif_Pajak", "Pembayaran_Pajak"] as const;
export const REPORT_ACCOUNTS = {
  KAS_BANK: "Kas dan bank", PIUTANG: "Piutang usaha", PERSEDIAAN: "Persediaan",
  SEWA_DIMUKA: "Sewa dibayar di muka", ASET_TETAP: "Harga perolehan aset",
  AKUM_PENYUSUTAN: "Akumulasi penyusutan", UTANG_USAHA: "Utang usaha",
  UTANG_PAJAK: "Utang pajak", PINJAMAN: "Pinjaman", UANG_MUKA: "Uang muka siswa",
  MODAL: "Modal", LABA_DITAHAN: "Laba ditahan", PRIVE: "Prive",
  PENDAPATAN: "Pendapatan jasa", BIAYA_JASA: "Biaya jasa",
  GAJI: "Gaji", UTILITAS: "Listrik, internet, dan air", PEMASARAN: "Pemasaran",
  PEMELIHARAAN: "Pemeliharaan", SEWA: "Sewa", ADMINISTRASI: "Administrasi dan umum",
  BIAYA_LAIN: "Biaya operasional lain", PENYUSUTAN: "Beban penyusutan",
  PAJAK: "Beban pajak", PENDAPATAN_LAIN: "Pendapatan lain", BEBAN_LAIN: "Beban lain",
  BELUM_DIPETAKAN: "Belum dipetakan",
} as const;
export type ReportAccount = keyof typeof REPORT_ACCOUNTS;
export const EXPENSE_ACCOUNTS: ReportAccount[] = ["BIAYA_JASA", "GAJI", "UTILITAS", "PEMASARAN", "PEMELIHARAAN", "SEWA", "ADMINISTRASI", "BIAYA_LAIN", "PENYUSUTAN", "PAJAK", "BEBAN_LAIN"];
export const MAPPING_ACCOUNTS: ReportAccount[] = ["PENDAPATAN", "PENDAPATAN_LAIN", "BIAYA_JASA", "GAJI", "UTILITAS", "PEMASARAN", "PEMELIHARAAN", "SEWA", "ADMINISTRASI", "BIAYA_LAIN", "PAJAK", "BEBAN_LAIN", "ASET_TETAP"];
export const OPENING_ACCOUNTS: ReportAccount[] = ["PIUTANG", "PERSEDIAAN", "SEWA_DIMUKA", "UTANG_USAHA", "UTANG_PAJAK", "PINJAMAN", "UANG_MUKA", "MODAL", "LABA_DITAHAN"];
export const CREDIT_ACCOUNTS: ReportAccount[] = ["AKUM_PENYUSUTAN", "UTANG_USAHA", "UTANG_PAJAK", "PINJAMAN", "UANG_MUKA", "MODAL", "LABA_DITAHAN", "PENDAPATAN", "PENDAPATAN_LAIN"];
export const JOURNAL_ACCOUNTS = (Object.keys(REPORT_ACCOUNTS) as ReportAccount[]).filter(k => !["KAS_BANK", "ASET_TETAP", "AKUM_PENYUSUTAN", "PENYUSUTAN", "BELUM_DIPETAKAN"].includes(k));
export function reportSetting(s: State, key: string, fallback = "") {
  return t(s.Pengaturan.find(r => r.key === key), "value") || fallback;
}
export function previousDay(date: string) {
  return new Date(Date.parse(date + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
}
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return month + "-" + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0");
}
export function monthIndex(date: string) {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}
function sum(values: number[]) { return values.reduce((a, b) => a + b, 0); }
export function reportingAnchor(s: State) {
  return reportSetting(s, "reporting_start") || s.Akun.map(a => t(a, "tanggal_saldo_awal")).sort()[0] || "9999-01-01";
}
export function mappingAt(s: State, category: string, date: string): ReportAccount | "" {
  return t(s.Pemetaan_Laporan.map((r, i) => ({ ...r, order: i }))
    .filter(r => t(r, "kategori_id") === category && t(r, "berlaku_mulai") <= date)
    .sort((a, b) => t(b, "berlaku_mulai").localeCompare(t(a, "berlaku_mulai")) || n(b, "order") - n(a, "order"))[0], "kelompok") as ReportAccount | "";
}
function original(s: State, tx: Row): Row {
  return tx.jenis === "PEMBALIK" ? s.Transaksi.find(r => r.transaksi_id === tx.transaksi_rujukan_id)! : tx;
}
export function cashBalance(s: State, asOf: string, accountId = "") {
  return sum(s.Akun.filter(a => (!accountId || a.akun_id === accountId) && t(a, "tanggal_saldo_awal") <= asOf).map(a =>
    n(a, "saldo_awal") + sum(s.Transaksi.filter(tx => tx.akun_id === a.akun_id && t(tx, "tanggal_transaksi") <= asOf).map(tx => n(tx, "nominal") * (tx.arah === "IN" ? 1 : -1)))));
}
export type CashbookLine = { id: string; date: string; description: string; account: string; incoming: number; outgoing: number; balance: number; internal: boolean; opening: boolean; reference: string };
export function cashbook(s: State, from: string, to: string, accountId = "") {
  const accounts = s.Akun.filter(a => !accountId || a.akun_id === accountId);
  const opening = sum(accounts.filter(a => t(a, "tanggal_saldo_awal") <= from).map(a => n(a, "saldo_awal") +
    sum(s.Transaksi.filter(tx => tx.akun_id === a.akun_id && t(tx, "tanggal_transaksi") < from).map(tx => n(tx, "nominal") * (tx.arah === "IN" ? 1 : -1)))));
  const records = s.Transaksi.map((tx, index) => ({ tx, index })).filter(({ tx }) => t(tx, "tanggal_transaksi") >= from && t(tx, "tanggal_transaksi") <= to && (!accountId || tx.akun_id === accountId));
  const events: { tx: Row; index: number; initial?: boolean }[] = [...records, ...accounts.filter(a => t(a, "tanggal_saldo_awal") > from && t(a, "tanggal_saldo_awal") <= to).map(a => ({
    index: -1, initial: true, tx: { transaksi_id: "opening-" + a.akun_id, akun_id: a.akun_id, tanggal_transaksi: a.tanggal_saldo_awal, nominal: a.saldo_awal, deskripsi: "Saldo awal akun", arah: "IN" },
  }))];
  events.sort((a, b) => t(a.tx, "tanggal_transaksi").localeCompare(t(b.tx, "tanggal_transaksi")) || a.index - b.index);
  let running = opening, incoming = 0, outgoing = 0, additionalOpening = 0;
  const lines: CashbookLine[] = events.map(({ tx, initial }) => {
    const base = initial ? tx : original(s, tx);
    const internal = !accountId && t(base, "jenis").startsWith("TRANSFER_");
    const delta = internal ? 0 : n(tx, "nominal") * (tx.arah === "IN" ? 1 : -1);
    const inc = !initial && delta > 0 ? delta : 0, out = !initial && delta < 0 ? -delta : 0;
    running += delta; incoming += inc; outgoing += out;
    if (initial) additionalOpening += delta;
    return { id: t(tx, "transaksi_id"), date: t(tx, "tanggal_transaksi"), description: t(tx, "deskripsi"), account: t(s.Akun.find(a => a.akun_id === tx.akun_id), "nama_akun"), incoming: inc, outgoing: out, balance: running, internal, opening: Boolean(initial), reference: t(tx, "operation_id") };
  });
  const closing = cashBalance(s, to, accountId);
  const warnings: string[] = [];
  if (!accounts.length) warnings.push("Belum ada akun kas/bank.");
  if (accounts.some(a => t(a, "tanggal_saldo_awal") > from)) warnings.push("Sebagian akun belum mempunyai saldo awal pada awal periode. Tanggal pembukaan ditampilkan dalam rincian.");
  return { opening, incoming, outgoing, additionalOpening, closing, lines, difference: running - closing, warnings };
}
export function assetInUse(s: State, asset: Row, asOf: string) {
  if (asset.sumber === "SALDO_AWAL") return t(asset, "tanggal_saldo_awal") <= asOf;
  const tx = s.Transaksi.find(r => r.transaksi_id === asset.transaksi_id);
  return Boolean(tx && t(tx, "tanggal_transaksi") <= asOf && !s.Transaksi.some(r => r.jenis === "PEMBALIK" && r.transaksi_rujukan_id === tx.transaksi_id && t(r, "tanggal_transaksi") <= asOf));
}
export function assetDepreciation(s: State, asset: Row, asOf: string) {
  if (!assetInUse(s, asset, asOf)) return 0;
  const cost = n(asset, "harga_perolehan"), residual = n(asset, "nilai_residu"), life = n(asset, "umur_bulan");
  const base = cost - residual, initial = asset.sumber === "SALDO_AWAL" ? n(asset, "akumulasi_awal") : 0;
  const start = monthIndex(t(asset, "tanggal_mulai"));
  const anchor = asset.sumber === "SALDO_AWAL" ? monthIndex(t(asset, "tanggal_saldo_awal")) : start;
  const consumed = Math.max(0, anchor - start), remaining = Math.max(0, life - consumed);
  const completedMonth = monthIndex(asOf) - (asOf === monthEnd(asOf.slice(0, 7)) ? 0 : 1);
  const elapsed = Math.max(0, completedMonth - Math.max(anchor, start) + 1);
  if (!remaining) return initial; // A fully elapsed opening asset must be reconciled during setup.
  if (elapsed >= remaining) return base;
  return Math.min(base, initial + Math.round(base * elapsed / life));
}
export function assetPeriodExpense(s: State, asset: Row, from: string, to: string) {
  const effectiveFrom = asset.sumber === "SALDO_AWAL" && t(asset, "tanggal_saldo_awal") > from ? t(asset, "tanggal_saldo_awal") : from;
  if (effectiveFrom > to) return 0;
  const before = asset.sumber === "SALDO_AWAL" && effectiveFrom === t(asset, "tanggal_saldo_awal") ? n(asset, "akumulasi_awal") : assetDepreciation(s, asset, previousDay(effectiveFrom));
  return assetDepreciation(s, asset, to) - before;
}
export function openingDerived(s: State, date = reportingAnchor(s)) {
  const cash = sum(s.Akun.filter(a => t(a, "tanggal_saldo_awal") <= date).map(a => n(a, "saldo_awal") + sum(s.Transaksi.filter(tx => tx.akun_id === a.akun_id && t(tx, "tanggal_transaksi") < date).map(tx => n(tx, "nominal") * (tx.arah === "IN" ? 1 : -1)))));
  const assets = s.Aset.filter(a => a.sumber === "SALDO_AWAL" && a.tanggal_saldo_awal === date);
  return { KAS_BANK: cash, ASET_TETAP: sum(assets.map(a => n(a, "harga_perolehan"))), AKUM_PENYUSUTAN: -sum(assets.map(a => n(a, "akumulasi_awal"))) };
}
export function openingRows(s: State) {
  const rows = s.Saldo_Neraca.filter(r => r.tanggal === reportingAnchor(s));
  const version = Math.max(0, ...rows.map(r => n(r, "versi")));
  return rows.filter(r => n(r, "versi") === version);
}
export function transactionReportAccount(s: State, tx: Row): ReportAccount | "" {
  const base = original(s, tx), kind = t(base, "jenis");
  if (kind === "PEMBAYARAN_SISWA" || kind === "REFUND_SISWA") return "PENDAPATAN";
  if (kind === "MODAL_MASUK") return "MODAL";
  if (kind === "PRIVE") return "PRIVE";
  if (kind === "PINJAMAN_MASUK" || kind === "POKOK_PINJAMAN_KELUAR") return "PINJAMAN";
  if (kind.startsWith("TRANSFER_")) return "";
  if (s.Aset.some(a => a.transaksi_id === base.transaksi_id)) return "ASET_TETAP";
  const tax = s.Pembayaran_Pajak.find(p => p.transaksi_id === base.transaksi_id);
  if (tax) return tax.perlakuan === "PELUNASAN_UTANG" ? "UTANG_PAJAK" : "PAJAK";
  return mappingAt(s, t(base, "kategori_id"), t(base, "tanggal_transaksi")) || "BELUM_DIPETAKAN";
}
export type ReportSource = { date: string; account: ReportAccount; value: number; description: string; reference: string; type: string };
function ledger(s: State, to: string) {
  const balances = Object.fromEntries(Object.keys(REPORT_ACCOUNTS).map(k => [k, 0])) as Record<ReportAccount, number>;
  const anchor = reportingAnchor(s), sources: ReportSource[] = [], warnings: string[] = [];
  const post = (account: ReportAccount, value: number, date: string, description: string, reference: string, type: string) => {
    balances[account] += value; sources.push({ date, account, value, description, reference, type });
  };
  if (to < anchor) return { balances, sources, warnings };
  const derived = openingDerived(s), opening = openingRows(s);
  for (const [key, value] of Object.entries(derived)) post(key as ReportAccount, value, anchor, "Saldo awal terhitung", "opening", "Saldo awal");
  for (const row of opening) if (!Object.keys(derived).includes(t(row, "akun_laporan")))
    post(t(row, "akun_laporan") as ReportAccount, n(row, "debit") - n(row, "kredit"), anchor, t(row, "sumber"), t(row, "operation_id"), "Saldo awal");
  for (const a of s.Akun.filter(a => t(a, "tanggal_saldo_awal") > anchor && t(a, "tanggal_saldo_awal") <= to && n(a, "saldo_awal") !== 0)) {
    post("KAS_BANK", n(a, "saldo_awal"), t(a, "tanggal_saldo_awal"), "Saldo awal akun setelah awal pembukuan", t(a, "akun_id"), "Saldo awal");
    warnings.push("Saldo awal akun " + t(a, "nama_akun") + " berada setelah awal pembukuan. Periksa jurnal sumber dananya.");
  }
  for (const tx of s.Transaksi.filter(r => t(r, "tanggal_transaksi") >= anchor && t(r, "tanggal_transaksi") <= to)) {
    const date = t(tx, "tanggal_transaksi"), delta = n(tx, "nominal") * (tx.arah === "IN" ? 1 : -1), account = transactionReportAccount(s, tx);
    post("KAS_BANK", delta, date, t(tx, "deskripsi"), t(tx, "transaksi_id"), "Transaksi");
    if (account) post(account, -delta, date, t(tx, "deskripsi"), t(tx, "transaksi_id"), "Transaksi");
    if (account === "BELUM_DIPETAKAN") warnings.push("Kategori belum dipetakan: " + t(tx, "deskripsi") + " (" + t(tx, "transaksi_id") + ").");
    if (account === "ASET_TETAP" && !s.Aset.some(a => a.transaksi_id === original(s, tx).transaksi_id)) warnings.push("Pembelian aset belum ditautkan ke daftar aset: " + t(tx, "deskripsi") + ".");
  }
  for (const row of s.Jurnal_Laporan.filter(r => t(r, "tanggal") >= anchor && t(r, "tanggal") <= to)) post(t(row, "akun_laporan") as ReportAccount, n(row, "debit") - n(row, "kredit"), t(row, "tanggal"), t(row, "deskripsi"), t(row, "jurnal_id"), "Jurnal nonkas");
  for (const asset of s.Aset) {
    const initial = asset.sumber === "SALDO_AWAL" ? n(asset, "akumulasi_awal") : 0;
    const depreciation = assetDepreciation(s, asset, to) - initial;
    if (depreciation) {
      post("PENYUSUTAN", depreciation, to, "Penyusutan " + t(asset, "nama_aset"), t(asset, "aset_id"), "Penyusutan");
      post("AKUM_PENYUSUTAN", -depreciation, to, "Penyusutan " + t(asset, "nama_aset"), t(asset, "aset_id"), "Penyusutan");
    }
  }
  return { balances, sources, warnings };
}
function profit(b: Record<ReportAccount, number>) {
  return -b.PENDAPATAN - b.PENDAPATAN_LAIN - sum(EXPENSE_ACCOUNTS.map(k => b[k])) - b.BELUM_DIPETAKAN;
}
export function financialStatements(s: State, from: string, to: string) {
  const end = ledger(s, to), before = ledger(s, previousDay(from)), anchor = reportingAnchor(s);
  const period = Object.fromEntries(Object.keys(REPORT_ACCOUNTS).map(k => [k, end.balances[k as ReportAccount] - before.balances[k as ReportAccount]])) as Record<ReportAccount, number>;
  const assets = s.Aset.map(a => {
    const cost = assetInUse(s, a, to) ? n(a, "harga_perolehan") : 0;
    const accumulated = assetDepreciation(s, a, to);
    return { asset: a, cost, accumulated, expense: assetPeriodExpense(s, a, from, to), book: cost - accumulated };
  }).filter(a => a.cost !== 0 || a.expense !== 0);
  const b = end.balances, assetTotal = b.KAS_BANK + b.PIUTANG + b.PERSEDIAAN + b.SEWA_DIMUKA + b.ASET_TETAP + b.AKUM_PENYUSUTAN;
  const liabilities = -b.UTANG_USAHA - b.UTANG_PAJAK - b.PINJAMAN - b.UANG_MUKA;
  const totalProfit = profit(b);
  const priorProfit = profit(ledger(s, to.slice(0, 4) + "-01-01" > anchor ? previousDay(to.slice(0, 4) + "-01-01") : previousDay(anchor)).balances);
  const equity = -b.MODAL - b.LABA_DITAHAN - b.PRIVE + totalProfit;
  const checks: { label: string; difference: number; detail: string }[] = [
    { label: "Pendapatan jasa = rincian transaksi/jurnal", difference: period.PENDAPATAN - sum(end.sources.filter(r => r.date >= from && r.account === "PENDAPATAN" && r.type !== "Saldo awal").map(r => r.value)), detail: "Penerimaan, refund, pembalik, dan penyesuaian dihitung sesuai tanggal efektif." },
    { label: "Beban = rincian biaya dan penyusutan", difference: sum(EXPENSE_ACCOUNTS.map(k => period[k])) - sum(end.sources.filter(r => r.date >= from && r.type !== "Saldo awal" && r.type !== "Penyusutan" && EXPENSE_ACCOUNTS.includes(r.account)).map(r => r.value)) - sum(assets.map(a => a.expense)), detail: "Pembelian aset dan pembayaran pokok pinjaman dipisahkan dari biaya." },
    { label: "Kas/bank = buku kas", difference: b.KAS_BANK - cashBalance(s, to), detail: "Tanggal dan cakupan seluruh akun sama." },
    { label: "Aset tetap = daftar aset", difference: b.ASET_TETAP - sum(assets.map(a => a.cost)), detail: "Pembelian aset ditautkan sekali." },
    { label: "Akumulasi penyusutan = daftar aset", difference: -b.AKUM_PENYUSUTAN - sum(assets.map(a => a.accumulated)), detail: "Penyusutan tidak mengubah kas." },
    { label: "Aset = kewajiban + ekuitas", difference: assetTotal - liabilities - equity, detail: "Selisih tidak dimasukkan otomatis ke modal/laba ditahan." },
  ];
  const warnings = [...end.warnings];
  if (reportSetting(s, "reporting_basis") !== "KAS_DISESUAIKAN") warnings.push("Pemilik perlu menetapkan dasar laporan: kas dengan penyesuaian nonkas.");
  if (from < anchor) warnings.push("Periode mencakup tanggal sebelum awal pembukuan " + anchor + ".");
  const opening = openingRows(s), derived = openingDerived(s);
  if (!opening.length) warnings.push("Saldo awal neraca belum diverifikasi.");
  for (const [key, value] of Object.entries(derived)) if (opening.length && sum(opening.filter(r => r.akun_laporan === key).map(r => n(r, "debit") - n(r, "kredit"))) !== value)
    warnings.push("Saldo awal " + REPORT_ACCOUNTS[key as ReportAccount] + " berubah setelah verifikasi. Periksa dan simpan ulang pembukaan.");
  if (checks.some(c => c.difference !== 0)) warnings.push("Ada selisih pada pemeriksaan antar laporan.");
  const sourceItems = end.sources.filter(r => r.date >= from && r.type !== "Saldo awal" && r.type !== "Penyusutan");
  for (const a of assets) if (a.expense) sourceItems.push({ date: to, account: "PENYUSUTAN", value: a.expense, description: "Penyusutan " + t(a.asset, "nama_aset"), reference: t(a.asset, "aset_id"), type: "Penyusutan" });
  return { from, to, anchor, balances: b, period, income: -period.PENDAPATAN, directCosts: period.BIAYA_JASA,
    grossProfit: -period.PENDAPATAN - period.BIAYA_JASA, netProfit: profit(period),
    assetTotal, liabilities, equity, retained: -b.LABA_DITAHAN + priorProfit, currentProfit: totalProfit - priorProfit,
    assets, checks, warnings: [...new Set(warnings)], ready: warnings.length === 0, sources: sourceItems };
}
export function taxReport(s: State, from: string, to: string) {
  const basis = reportSetting(s, "tax_basis"), warnings: string[] = [];
  const months: string[] = [];
  for (let idx = monthIndex(from); idx <= monthIndex(to) && months.length < 120; idx++) months.push(String(Math.floor(idx / 12)).padStart(4, "0") + "-" + String(idx % 12 + 1).padStart(2, "0"));
  if (!basis) warnings.push("Dasar omzet pajak belum ditetapkan oleh pemilik.");
  const rows = months.map(month => {
    const start = month + "-01" < from ? from : month + "-01", end = monthEnd(month) > to ? to : monthEnd(month);
    const cashRevenue = s.Transaksi.filter(tx => t(tx, "tanggal_transaksi") >= start && t(tx, "tanggal_transaksi") <= end && transactionReportAccount(s, tx) === "PENDAPATAN");
    const turnover = basis === "PENDAPATAN_BERSIH" ? financialStatements(s, start, end).income : sum(cashRevenue.filter(tx => original(s, tx).jenis !== "REFUND_SISWA").map(tx => n(tx, "nominal") * (tx.arah === "IN" ? 1 : -1)));
    const rate = s.Tarif_Pajak.map((r, i) => ({ ...r, order: i })).filter(r => t(r, "berlaku_mulai") <= start).sort((a, b) => t(b, "berlaku_mulai").localeCompare(t(a, "berlaku_mulai")) || n(b, "order") - n(a, "order"))[0];
    const bp = rate ? n(rate, "tarif_basis_poin") : null;
    if (bp === null) warnings.push("Tarif belum ditetapkan untuk " + month + ".");
    const payments = s.Pembayaran_Pajak.filter(p => p.periode_pajak === month).map(p => {
      const tx = s.Transaksi.find(tx => tx.transaksi_id === p.transaksi_id)!;
      const net = t(tx, "tanggal_transaksi") <= to ? n(tx, "nominal") - sum(s.Transaksi.filter(r => r.jenis === "PEMBALIK" && r.transaksi_rujukan_id === tx.transaksi_id && t(r, "tanggal_transaksi") <= to).map(r => n(r, "nominal"))) : 0;
      return net;
    });
    const tax = bp === null || !basis ? null : Math.round(Math.max(0, turnover) * bp / 10000);
    return { month, turnover, basisPoints: bp, tax, paid: sum(payments), completeMonth: start === month + "-01" && end === monthEnd(month) };
  });
  const total = rows.some(r => r.tax === null) ? null : sum(rows.map(r => r.tax!));
  const payments = s.Pembayaran_Pajak.map(p => {
    const tx = s.Transaksi.find(r => r.transaksi_id === p.transaksi_id)!;
    const amount = n(tx, "nominal") - sum(s.Transaksi.filter(r => r.jenis === "PEMBALIK" && r.transaksi_rujukan_id === tx.transaksi_id && t(r, "tanggal_transaksi") <= to).map(r => n(r, "nominal")));
    return { ...p, date: t(tx, "tanggal_transaksi"), amount, description: t(tx, "deskripsi") } as Row & { date: string; amount: number; description: string };
  }).filter(p => p.date >= from && p.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  return { rows, total, turnover: sum(rows.map(r => r.turnover)), payments, warnings, basis, ready: warnings.length === 0 };
}
export function reportCSV(rows: (string | number | null)[][]) {
  return "\uFEFF" + rows.map(row => row.map(value => {
    if (typeof value === "number") return String(value);
    let v = value === null ? "" : String(value);
    if (/^[\s]*[=+\-@\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
}
