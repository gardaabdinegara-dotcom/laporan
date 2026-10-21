import { dateLabel, num, setting, text, type Actor, type State } from "./domain.ts";
import { EXPENSE_ACCOUNTS, REPORT_ACCOUNTS, assetPeriodExpense, cashbook, financialStatements, monthEnd, monthIndex, reportSetting, reportingAnchor, taxReport, type ReportAccount } from "./reporting.ts";

export const PDF_REPORT_TITLES = {
  cash: "Buku Kas",
  profit: "Laporan Laba Rugi",
  balance: "Laporan Neraca",
  assets: "Daftar Aset dan Penyusutan",
  tax: "Rekap Omzet dan Pajak",
  checks: "Pemeriksaan Antar Laporan",
} as const;
export type PdfReportKind = keyof typeof PDF_REPORT_TITLES;
export type PdfRow = { cells: string[]; style?: "section" | "total" | "result" };
export type PdfTable = {
  title: string;
  columns: { label: string; weight: number; numeric?: boolean }[];
  rows: PdfRow[];
  note?: string;
  pageBreak?: boolean;
};
export type ReportDocument = {
  kind: PdfReportKind;
  filename: string;
  business: string;
  title: string;
  period: string;
  status: string;
  source: string;
  dataTime: string;
  issued: string;
  basis: string;
  location: string;
  signer: string;
  position: string;
  landscape: boolean;
  tables: PdfTable[];
  notes: string[];
  warnings: string[];
};
export type PdfReportOptions = {
  kind: PdfReportKind;
  from: string;
  to: string;
  accountId?: string;
  role: Actor["role"];
  simulation: boolean;
  dataAsOf: string;
  generatedAt?: string;
};

// Parentheses make negative balances and losses unambiguous on printed reports.
export const pdfAmount = (value: number) => value < 0
  ? "(" + Math.abs(value).toLocaleString("id-ID") + ")"
  : (value === 0 ? 0 : value).toLocaleString("id-ID");
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const row = (cells: string[], style?: PdfRow["style"]): PdfRow => ({ cells, style });
const amountRow = (label: string, value: number, style?: PdfRow["style"]) => row([label, pdfAmount(value)], style);
const section = (label: string) => row([label, ""], "section");
const monthLabel = (month: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T00:00:00Z"));
const slug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);

export function validReportRange(from: string, to: string) {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 9998
    && Number.isFinite(Date.parse(value + "T00:00:00Z"))
    && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
  return validDate(from) && validDate(to) && from <= to && Number(to.slice(0, 4)) - Number(from.slice(0, 4)) <= 9;
}

/** A snapshot of the selected report, independent of UI theme or hidden DOM. */
export function buildReportDocument(data: State, options: PdfReportOptions): ReportDocument {
  const { kind, from, to, role, simulation } = options;
  if (!Object.hasOwn(PDF_REPORT_TITLES, kind) || !validReportRange(from, to)) throw new Error("Pilih jenis dan rentang laporan yang valid, maksimum 10 tahun.");
  const accountId = kind === "cash" ? options.accountId || "" : "";
  const account = data.Akun.find(a => a.akun_id === accountId);
  if (accountId && !account) throw new Error("Akun buku kas tidak ditemukan. Pilih ulang rekening.");
  const generatedAt = options.generatedAt || new Date().toISOString();
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("Tanggal pembuatan laporan tidak valid.");
  const timezone = setting(data, "timezone", "Asia/Jakarta");
  const issuedDate = todayAt(generatedAt, timezone);
  const report = financialStatements(data, from, to), book = cashbook(data, from, to, accountId), tax = taxReport(data, from, to);
  const calculationReady = kind === "cash" ? !book.warnings.length && book.difference === 0 : kind === "tax" ? tax.ready && report.ready : report.ready;
  const future = to > issuedDate;
  const status = calculationReady ? future ? "PROYEKSI" : "SIAP DIPERIKSA" : "DRAF";
  const warnings = [...(kind === "cash" ? book.warnings : [...report.warnings, ...(kind === "tax" ? tax.warnings : [])])];
  if (future) warnings.push("Periode belum berakhir. Angka akhir periode dan penyusutan setelah tanggal pembuatan merupakan proyeksi berdasarkan data saat ini.");
  const accountName = text(account, "nama_akun") || "Semua kas dan bank";
  const amountColumns = [{ label: "Keterangan", weight: 3 }, { label: "Nominal (Rp)", weight: 1, numeric: true }];
  const model: ReportDocument = {
    kind, filename: "garda-" + ({ cash: "buku-kas", profit: "laba-rugi", balance: "neraca", assets: "aset-penyusutan", tax: "omzet-pajak", checks: "pemeriksaan" }[kind]) + "-" + from + "_" + to + (accountId ? "-" + (slug(accountName) || "akun") : "") + ".pdf",
    business: setting(data, "business_name", "Garda Abdi Negara"),
    title: PDF_REPORT_TITLES[kind],
    period: (kind === "balance" ? "Posisi per " + dateLabel(to) : dateLabel(from) + " - " + dateLabel(to)) + (kind === "cash" ? " | " + accountName : ""),
    status: (simulation ? "DATA CONTOH | " : "") + status,
    source: simulation ? "Data simulasi lokal" : "Google Sheets",
    dataTime: options.dataAsOf && Number.isFinite(Date.parse(options.dataAsOf)) ? new Date(options.dataAsOf).toLocaleString("id-ID", { timeZone: timezone }) : "Sesi saat ini",
    issued: dateLabel(issuedDate), location: reportSetting(data, "report_location"),
    signer: reportSetting(data, "report_signer") || "________________________",
    position: reportSetting(data, "report_position") || "Penanggung jawab",
    basis: kind === "cash" ? "Basis kas. Saldo awal tidak termasuk penerimaan."
      : "Dasar laporan: " + (reportSetting(data, "reporting_basis") === "KAS_DISESUAIKAN" ? "kas dengan penyesuaian nonkas" : "belum ditetapkan") + ". Awal pembukuan: " + dateLabel(reportingAnchor(data)) + ".",
    landscape: kind === "balance" || kind === "assets",
    tables: [], notes: [], warnings: [...new Set(warnings)],
  };
  if (role === "VIEWER" && model.warnings.length) model.warnings = ["Periksa kelengkapan data, pengaturan laporan, dan tanggal akhir periode sebelum menggunakan laporan ini."];
  if (kind === "cash") {
    if (role === "VIEWER") {
      model.tables.push({ title: "Ringkasan buku kas", columns: amountColumns, rows: [
        amountRow("Saldo awal", book.opening), amountRow("Pemasukan", book.incoming),
        amountRow("Pengeluaran", book.outgoing), amountRow("Tambahan saldo pembukaan akun", book.additionalOpening),
        amountRow("Saldo akhir", book.closing, "result"),
      ] });
      model.notes.push("Hak akses VIEWER: laporan berisi ringkasan tanpa rincian transaksi.");
    } else {
      for (let index = monthIndex(from); index <= monthIndex(to); index++) {
        const month = String(Math.floor(index / 12)).padStart(4, "0") + "-" + String(index % 12 + 1).padStart(2, "0");
        const start = month + "-01" < from ? from : month + "-01", end = monthEnd(month) > to ? to : monthEnd(month);
        const part = cashbook(data, start, end, accountId);
        model.tables.push({
          title: monthLabel(month),
          columns: [{ label: "Tanggal", weight: 1.05 }, { label: "Keterangan / akun", weight: 3 }, { label: "Pemasukan (Rp)", weight: 1.35, numeric: true }, { label: "Pengeluaran (Rp)", weight: 1.35, numeric: true }, { label: "Saldo (Rp)", weight: 1.45, numeric: true }],
          rows: [
            row([dateLabel(start), "Saldo awal periode", "-", "-", pdfAmount(part.opening)], "total"),
            ...part.lines.map(l => row([dateLabel(l.date), (l.description || "Transaksi") + "\n" + l.account + (l.internal ? " | Transfer internal, neto nol" : l.opening ? " | Pembukaan akun" : "") + "\nRef: " + (l.reference || l.id), l.incoming ? pdfAmount(l.incoming) : "-", l.outgoing ? pdfAmount(l.outgoing) : "-", pdfAmount(l.balance)])),
            row([dateLabel(end), "Saldo akhir" + (part.additionalOpening ? "\nTambahan saldo pembukaan: Rp" + pdfAmount(part.additionalOpening) : ""), pdfAmount(part.incoming), pdfAmount(part.outgoing), pdfAmount(part.closing)], "result"),
          ],
        });
      }
      if (from.slice(0, 7) !== to.slice(0, 7)) model.tables.push({ title: "Total periode terpilih", columns: amountColumns, rows: [
        amountRow("Saldo awal", book.opening), amountRow("Total pemasukan", book.incoming),
        amountRow("Total pengeluaran", book.outgoing), amountRow("Tambahan saldo pembukaan akun", book.additionalOpening),
        amountRow("Saldo akhir", book.closing, "result"),
      ] });
    }
    model.notes.push("Saldo akhir tiap bulan menjadi saldo awal bulan berikutnya. Transfer internal bernilai neto nol pada gabungan akun; pada satu rekening, sisi mutasinya tetap terlihat.");
  }
  if (kind === "profit") {
    const operational = EXPENSE_ACCOUNTS.filter(k => k !== "BIAYA_JASA" && k !== "BEBAN_LAIN");
    model.tables.push({ title: "", columns: amountColumns, rows: [
      section("Pendapatan"), amountRow(REPORT_ACCOUNTS.PENDAPATAN, report.income),
      section("Biaya jasa"), amountRow(REPORT_ACCOUNTS.BIAYA_JASA, report.directCosts),
      amountRow("LABA KOTOR", report.grossProfit, "total"),
      section("Biaya operasional"), ...operational.map(k => amountRow(REPORT_ACCOUNTS[k], report.period[k])),
      amountRow("Jumlah biaya operasional", sum(operational.map(k => report.period[k])), "total"),
      section("Pendapatan dan beban lain"), amountRow("Pendapatan lain", -report.period.PENDAPATAN_LAIN), amountRow("Beban lain", report.period.BEBAN_LAIN),
      ...(report.period.BELUM_DIPETAKAN ? [amountRow("Mutasi usaha belum dipetakan (sementara)", report.period.BELUM_DIPETAKAN)] : []),
      amountRow(calculationReady ? "LABA (RUGI) BERSIH" : "LABA (RUGI) SEMENTARA", report.netProfit, "result"),
    ] });
    model.notes.push("Pembelian aset, modal, prive, dan pokok pinjaman dipisahkan dari laba rugi. Penyusutan merupakan beban nonkas. Angka dalam tanda kurung menunjukkan nilai negatif.");
  }
  if (kind === "balance") {
    const b = report.balances;
    const left: [string, string, PdfRow["style"]?][] = [
      ["Aset lancar", "", "section"], ...(["KAS_BANK", "PIUTANG", "PERSEDIAAN", "SEWA_DIMUKA"] as ReportAccount[]).map(k => [REPORT_ACCOUNTS[k], pdfAmount(b[k])] as [string, string]),
      ["Jumlah aset lancar", pdfAmount(b.KAS_BANK + b.PIUTANG + b.PERSEDIAAN + b.SEWA_DIMUKA), "total"],
      ["Aset tetap", "", "section"], ["Harga perolehan aset", pdfAmount(b.ASET_TETAP)],
      ["Akumulasi penyusutan", pdfAmount(b.AKUM_PENYUSUTAN)],
      ["Nilai buku aset tetap", pdfAmount(b.ASET_TETAP + b.AKUM_PENYUSUTAN), "total"],
    ];
    const right: [string, string][] = [
      ["Kewajiban", ""], ...(["UTANG_USAHA", "UTANG_PAJAK", "PINJAMAN", "UANG_MUKA"] as ReportAccount[]).map(k => [REPORT_ACCOUNTS[k], pdfAmount(-b[k])] as [string, string]),
      ["Jumlah kewajiban", pdfAmount(report.liabilities)], ["Ekuitas", ""], ["Modal", pdfAmount(-b.MODAL)],
      ["Laba ditahan", pdfAmount(report.retained)], ["Laba berjalan tahun ini", pdfAmount(report.currentProfit)],
      ["Prive", pdfAmount(-b.PRIVE)], ["Jumlah ekuitas", pdfAmount(report.equity)],
    ];
    model.tables.push({
      title: "", columns: [{ label: "ASET", weight: 2.2 }, { label: "Nominal (Rp)", weight: 1.15, numeric: true }, { label: "KEWAJIBAN DAN EKUITAS", weight: 2.2 }, { label: "Nominal (Rp)", weight: 1.15, numeric: true }],
      rows: Array.from({ length: Math.max(left.length, right.length) }, (_, i) => row([left[i]?.[0] || "", left[i]?.[1] || "", right[i]?.[0] || "", right[i]?.[1] || ""], left[i]?.[2] || (right[i]?.[0].startsWith("Jumlah") ? "total" : undefined))).concat([
        row(["TOTAL ASET", pdfAmount(report.assetTotal), "TOTAL KEWAJIBAN DAN EKUITAS", pdfAmount(report.liabilities + report.equity)], "result"),
      ]),
    });
    model.notes.push("Nilai negatif dan akumulasi penyusutan ditulis dalam tanda kurung. Saldo mencakup pembukaan dan histori sampai tanggal posisi. Selisih neraca tidak dimasukkan otomatis ke modal atau laba ditahan.");
  }
  if (kind === "assets") {
    model.tables.push({
      title: "Daftar aset per " + dateLabel(to),
      columns: [{ label: "Aset / sumber", weight: 2 }, { label: "Perolehan / mulai susut", weight: 1.4 }, { label: "Umur (bln)", weight: .6, numeric: true }, ...["Harga perolehan", "Residu", "Beban periode", "Akumulasi", "Nilai buku"].map(label => ({ label: label + " (Rp)", weight: 1.2, numeric: true }))],
      rows: [...report.assets.map(a => row([text(a.asset, "nama_aset") + "\n" + (a.asset.sumber === "SALDO_AWAL" ? "Saldo awal" : "Pembelian tertaut"), dateLabel(text(a.asset, "tanggal_perolehan")) + "\n" + text(a.asset, "tanggal_mulai").slice(0, 7), String(num(a.asset, "umur_bulan")), pdfAmount(a.cost), pdfAmount(num(a.asset, "nilai_residu")), pdfAmount(a.expense), pdfAmount(a.accumulated), pdfAmount(a.book)])),
        row(["TOTAL", "", "", pdfAmount(sum(report.assets.map(a => a.cost))), pdfAmount(sum(report.assets.map(a => num(a.asset, "nilai_residu")))), pdfAmount(sum(report.assets.map(a => a.expense))), pdfAmount(sum(report.assets.map(a => a.accumulated))), pdfAmount(sum(report.assets.map(a => a.book)))], "result")],
    });
    const year = to.slice(0, 4), months = Array.from({ length: 12 }, (_, i) => year + "-" + String(i + 1).padStart(2, "0"));
    const assets = data.Aset.filter(a => text(a, "tanggal_perolehan").slice(0, 4) <= year);
    // Six months per table keep every nominal readable on A4 landscape.
    for (const half of [months.slice(0, 6), months.slice(6)]) {
      const totals = half.map(month => sum(assets.map(a => assetPeriodExpense(data, a, month + "-01", monthEnd(month)))));
      model.tables.push({
        title: "Jadwal penyusutan " + year + " | " + monthLabel(half[0]).split(" ")[0] + " - " + monthLabel(half[5]),
        pageBreak: half[0] === year + "-01",
        columns: [{ label: "Aset", weight: 2 }, ...half.map(m => ({ label: monthLabel(m).split(" ")[0] + " (Rp)", weight: 1.15, numeric: true })), { label: "Total semester (Rp)", weight: 1.4, numeric: true }],
        rows: [...assets.map(a => { const values = half.map(m => assetPeriodExpense(data, a, m + "-01", monthEnd(m))); return row([text(a, "nama_aset"), ...values.map(pdfAmount), pdfAmount(sum(values))]); }),
          row(["TOTAL", ...totals.map(pdfAmount), pdfAmount(sum(totals))], "result")],
        note: "Jadwal satu tahun penuh. Angka setelah tanggal posisi laporan merupakan proyeksi; beban periode terpilih tercantum pada daftar aset.",
      });
    }
    model.notes.push("Metode garis lurus, pembulatan kumulatif, dan batas nilai residu. Penyusutan tidak membuat transaksi kas keluar kedua.");
  }
  if (kind === "tax") {
    model.basis += " Dasar omzet: " + (tax.basis === "KAS_BRUTO" ? "penerimaan jasa bruto" : tax.basis === "PENDAPATAN_BERSIH" ? "pendapatan jasa setelah penyesuaian" : "belum ditetapkan") + ".";
    model.tables.push({
      title: "Rekap bulanan",
      columns: [{ label: "Bulan", weight: 1.4 }, { label: "Omzet (Rp)", weight: 1.3, numeric: true }, { label: "Tarif", weight: .8, numeric: true }, { label: "Perhitungan pajak (Rp)", weight: 1.3, numeric: true }, { label: "Dibayar untuk bulan ini (Rp)", weight: 1.4, numeric: true }],
      rows: [...tax.rows.map(r => row([monthLabel(r.month) + (r.completeMonth ? "" : "\nPeriode sebagian"), pdfAmount(r.turnover), r.basisPoints === null ? "Belum diatur" : (r.basisPoints / 100).toLocaleString("id-ID") + "%", r.tax === null ? "Belum lengkap" : pdfAmount(r.tax), pdfAmount(r.paid)])),
        row(["TOTAL", pdfAmount(tax.turnover), "", tax.total === null ? "Belum lengkap" : pdfAmount(tax.total), pdfAmount(sum(tax.rows.map(r => r.paid)))], "result")],
    });
    if (role !== "VIEWER") model.tables.push({
      title: "Pembayaran kas pada periode terpilih",
      columns: [{ label: "Tanggal bayar", weight: 1.2 }, { label: "Periode pajak", weight: 1 }, { label: "Keterangan / perlakuan", weight: 2.5 }, { label: "Nominal (Rp)", weight: 1.3, numeric: true }],
      rows: tax.payments.map(p => row([dateLabel(p.date), text(p, "periode_pajak"), p.description + "\n" + (p.perlakuan === "PELUNASAN_UTANG" ? "Pelunasan utang pajak" : "Beban pajak"), pdfAmount(p.amount)])),
    });
    model.notes.push("Perhitungan mengikuti dasar dan tarif yang ditetapkan pemilik. Tanggal bayar berbeda dari periode kewajiban. Pembayaran untuk satu tahun penuh tidak dibagi otomatis ke setiap bulan; total pembayaran bulanan hanya mencakup tautan ke bulan terkait.");
  }
  if (kind === "checks") {
    model.tables.push({
      title: "Pencocokan angka antar laporan",
      columns: [{ label: "Pemeriksaan", weight: 2 }, { label: "Selisih (Rp)", weight: 1, numeric: true }, { label: "Hasil / keterangan", weight: 2.5 }],
      rows: report.checks.map(c => row([c.label, pdfAmount(c.difference), (c.difference === 0 ? "Cocok. " : "Perlu diperiksa. ") + c.detail])),
    });
    model.notes.push("Pemeriksaan kas fisik dan mutasi bank dilakukan terpisah melalui Ringkasan kas. Laporan ini tidak membuat jurnal atau angka penyeimbang.");
  }
  if (model.tables.every(table => !table.rows.length)) model.notes.push("Belum ada data pada periode terpilih.");
  return model;
}

function todayAt(instant: string, timezone: string) {
  // Same business timezone as the app; explicit instant keeps exports reproducible in tests.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)!.value).join("-");
}
