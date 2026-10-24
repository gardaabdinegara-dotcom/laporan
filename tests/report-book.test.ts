import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { annualDemoState } from "../lib/annual-demo.ts";
import { annualYearFromRange, buildAnnualReport, ANNUAL_REPORT_ORDER, type AnnualReportOptions } from "../lib/report-book.ts";
import { renderAnnualReportPdf } from "../lib/report-book-pdf.ts";

const options: AnnualReportOptions = { year: "2025", role: "OWNER", simulation: true, dataAsOf: "2026-10-21T01:00:00Z", generatedAt: "2026-10-21T02:00:00Z" };
const fonts = {
  regular: new Uint8Array(readFileSync(new URL("../public/fonts/terrace-report-regular.ttf", import.meta.url))),
  bold: new Uint8Array(readFileSync(new URL("../public/fonts/terrace-report-bold.ttf", import.meta.url))),
  logo: new Uint8Array(readFileSync(new URL("../public/brand/garda-report-logo-v1.png", import.meta.url))),
};

test("paket satu tahun menyatukan enam laporan dari snapshot yang tidak mengubah data", () => {
  const data = annualDemoState(), before = JSON.stringify(data), book = buildAnnualReport(data, options);
  assert.deepEqual(book.sections.map(s => s.kind), ANNUAL_REPORT_ORDER);
  assert.equal(book.filename, "garda-semua-laporan-2025.pdf");
  assert.equal(book.status, "DATA CONTOH | SIAP DIPERIKSA");
  assert.equal(book.totals.income, 134500000); assert.equal(book.totals.netProfit, 5908750);
  assert.equal(book.totals.closing, 30617500); assert.equal(book.totals.assets, 61872708);
  assert.equal(book.totals.assets, book.totals.liabilities + book.totals.equity);
  assert.equal(book.totals.tax, 672500); assert.equal(book.totals.taxPaid, 1552500);
  assert.equal(book.monthly.length, 12);
  assert.equal(book.monthly.reduce((sum, m) => sum + m.incoming, 0), book.totals.incoming);
  assert.equal(book.monthly.reduce((sum, m) => sum + m.netProfit, 0), book.totals.netProfit);
  assert.equal(book.monthly.at(-1)?.closing, book.totals.closing);
  assert.ok(book.sections.every(s => s.issued === book.issued && s.dataTime === book.dataTime));
  assert.equal(JSON.stringify(data), before);
  const captured = JSON.stringify(book);
  data.Transaksi[0].nominal = 999999999; data.Transaksi[0].deskripsi = "DIUBAH SETELAH KLIK";
  data.Aset[0].nama_aset = "DIUBAH SETELAH KLIK";
  assert.equal(JSON.stringify(book), captured, "Perubahan setelah klik tidak mengubah isi unduhan");
});

test("paket menerima tepat satu tahun kalender, termasuk tahun kabisat", () => {
  for (const year of ["1900", "2024", "2025", "9998"]) assert.equal(annualYearFromRange(year + "-01-01", year + "-12-31"), year);
  for (const [from, to] of [["2025-02-01", "2025-12-31"], ["2025-01-01", "2026-12-31"], ["2025-01-01", "2025-12-30"], ["2025-02-30", "2025-12-31"]]) assert.equal(annualYearFromRange(from, to), null);
  for (const year of ["", "0", "2025.5", "1899", "9999", "2025-01"]) assert.throws(() => buildAnnualReport(annualDemoState(), { ...options, year }), /tahun lengkap/);
  const prior = buildAnnualReport(annualDemoState(), { ...options, year: "2024" });
  assert.equal(prior.year, "2024"); assert.equal(prior.monthly[1].month, "2024-02");
  assert.ok(prior.sections.every(s => s.period.includes("2024")));
});

test("saldo tambahan akun di tengah tahun tetap terpisah dari penerimaan", () => {
  const data = annualDemoState();
  data.Akun.push({ ...data.Akun[0], akun_id: "kas-tengah-tahun", nama_akun: "Kas pembukaan Juni", tanggal_saldo_awal: "2025-06-15", saldo_awal: 123456 });
  const book = buildAnnualReport(data, options);
  assert.equal(book.totals.incoming, 134500000);
  assert.equal(book.totals.additionalOpening, 123456);
  assert.equal(book.monthly[5].additionalOpening, 123456);
  assert.equal(book.totals.closing, book.totals.opening + book.totals.additionalOpening + book.totals.incoming - book.totals.outgoing);
});

test("VIEWER mempertahankan ringkasan tanpa rincian transaksi dan pembayaran pajak", () => {
  const data = annualDemoState();
  data.Transaksi[0].deskripsi = "RAHASIA-TRANSAKSI-UNTUK-UJI";
  data.Pembayaran_Pajak[0].catatan = "RAHASIA-PAJAK-UNTUK-UJI";
  const owner = buildAnnualReport(data, options), viewer = buildAnnualReport(data, { ...options, role: "VIEWER" });
  assert.match(JSON.stringify(owner), /RAHASIA-TRANSAKSI/);
  assert.doesNotMatch(JSON.stringify(viewer), /RAHASIA-TRANSAKSI|RAHASIA-PAJAK/);
  assert.equal(viewer.detail, false);
  assert.equal(viewer.sections.find(s => s.kind === "cash")?.tables.length, 1);
  assert.equal(viewer.sections.find(s => s.kind === "tax")?.tables.length, 1);
  assert.deepEqual(viewer.totals, owner.totals);
});

test("pemeriksaan nol tidak menghapus Draf, dan pajak belum lengkap tidak menjadi nol", () => {
  const data = annualDemoState(); data.Tarif_Pajak = [];
  const draft = buildAnnualReport(data, { ...options, simulation: false });
  assert.equal(draft.totals.checksMatched, 6);
  assert.equal(draft.status, "DRAF"); assert.equal(draft.totals.tax, null);
  const future = buildAnnualReport(annualDemoState(), { ...options, generatedAt: "2025-10-01T00:00:00Z" });
  assert.equal(future.status, "DATA CONTOH | PROYEKSI");
  assert.ok(future.sections.every(s => s.warnings.some(w => /belum berakhir/.test(w))));
});

test("PDF tahunan memuat tautan, bookmark, dan orientasi campuran dengan halaman dinamis", () => {
  const outputDir = process.env.PDF_BOOK_QA_DIR;
  if (outputDir) mkdirSync(outputDir, { recursive: true });
  for (const role of ["OWNER", "VIEWER"] as const) {
    const book = buildAnnualReport(annualDemoState(), { ...options, role }), bytes = renderAnnualReportPdf(book, fonts);
    const raw = new TextDecoder().decode(bytes);
    assert.equal(raw.slice(0, 5), "%PDF-"); assert.match(raw.slice(-50), /%%EOF/);
    assert.equal((raw.match(/\/Subtype \/Link/g) || []).length, 7);
    assert.match(raw, /\/Outlines/);
    const pages = [...raw.matchAll(/\/Type \/Page\s(?!s)/g)].length;
    assert.ok(pages >= 10);
    if (role === "OWNER") assert.equal(pages, 24);
    else assert.ok(pages < 24, "Daftar isi mengikuti jumlah halaman VIEWER");
    assert.ok((raw.match(/\/MediaBox \[0 0 841/g) || []).length >= 4, "Neraca dan aset memakai landscape");
    if (outputDir) writeFileSync(join(outputDir, "annual-" + role.toLowerCase() + ".pdf"), bytes);
  }
});

test("grafik dan paket tetap dapat dibuat pada data kosong serta Draf dengan catatan panjang", () => {
  const data = annualDemoState(); data.Transaksi = []; data.Pembayaran_Pajak = []; data.Aset = []; data.Tarif_Pajak = [];
  const book = buildAnnualReport(data, options), bytes = renderAnnualReportPdf(book, fonts);
  assert.equal(book.totals.tax, null); assert.equal(book.status, "DATA CONTOH | DRAF");
  assert.ok(book.monthly.every(m => m.incoming === 0 && m.outgoing === 0));
  assert.ok(bytes.length > 50000);
  const outputDir = process.env.PDF_BOOK_QA_DIR;
  if (outputDir) writeFileSync(join(outputDir, "annual-empty-draft.pdf"), bytes);
});
