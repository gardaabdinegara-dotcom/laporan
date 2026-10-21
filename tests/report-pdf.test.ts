import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { demoState, type State } from "../lib/domain.ts";
import { buildReportDocument, PDF_REPORT_TITLES, pdfAmount, validReportRange, type PdfReportKind, type PdfReportOptions } from "../lib/report-document.ts";
import { loadReportFonts, renderReportPdf } from "../lib/report-pdf.ts";

const options: PdfReportOptions = {
  kind: "profit", from: "2026-10-01", to: "2026-10-31", role: "OWNER",
  simulation: true, dataAsOf: "2026-11-10T04:00:00Z", generatedAt: "2026-11-10T05:00:00Z",
};
const document = (state: State, changes: Partial<PdfReportOptions> = {}) => buildReportDocument(state, { ...options, ...changes });

test("PDF mengambil jenis, periode, status, serta laba dari snapshot terpilih", () => {
  const state = demoState(), before = JSON.stringify(state), model = document(state);
  assert.equal(model.title, "Laporan Laba Rugi");
  assert.equal(model.filename, "garda-laba-rugi-2026-10-01_2026-10-31.pdf");
  assert.match(model.period, /1 Okt 2026 - 31 Okt 2026/);
  assert.equal(model.status, "DATA CONTOH | SIAP DIPERIKSA");
  assert.deepEqual(model.tables[0].rows.at(-1)?.cells, ["LABA (RUGI) BERSIH", "350.000"]);
  assert.equal(JSON.stringify(state), before, "Ekspor tidak mengubah state atau mencatat transaksi");
});

test("neraca PDF mempertahankan akumulasi negatif dan total yang seimbang", () => {
  const model = document(demoState(), { kind: "balance" });
  assert.equal(model.landscape, true);
  assert.match(model.period, /Posisi per 31 Okt 2026/);
  assert.ok(model.tables[0].rows.some(r => r.cells.includes("(100.000)")));
  assert.equal(pdfAmount(-0), "0");
  assert.deepEqual(model.tables[0].rows.at(-1)?.cells, ["TOTAL ASET", "6.550.000", "TOTAL KEWAJIBAN DAN EKUITAS", "6.550.000"]);
});

test("buku kas PDF mengikuti rekening dan batas rentang terpilih", () => {
  const state = demoState();
  const filtered = document(state, { kind: "cash", accountId: "bank" });
  assert.match(filtered.period, /bank/i);
  assert.match(filtered.filename, /bank.*\.pdf$/);
  assert.equal(filtered.tables[0].rows.at(-1)?.cells.at(-1), "4.650.000");
  for (const cell of filtered.tables[0].rows.flatMap(r => r.cells)) assert.doesNotMatch(cell, /\nKas /);
  const november = document(state, { kind: "cash", from: "2026-11-01", to: "2026-11-30" });
  assert.equal(november.tables[0].rows.length, 2);
  assert.equal(november.tables[0].rows[0].cells.at(-1), "5.450.000");
  assert.equal(november.tables[0].rows[1].cells.at(-1), "5.450.000");
});

test("buku kas tahunan dibagi per bulan dan saldo bergulir sesuai contoh", () => {
  const state = demoState();
  for (const account of state.Akun) account.tanggal_saldo_awal = "2025-12-31";
  const model = document(state, { kind: "cash", from: "2026-01-01", to: "2026-12-31" });
  assert.equal(model.tables.length, 13);
  assert.equal(model.tables[0].title, "Januari 2026");
  assert.equal(model.tables[11].title, "Desember 2026");
  for (let i = 0; i < 11; i++) assert.equal(model.tables[i].rows.at(-1)?.cells.at(-1), model.tables[i + 1].rows[0].cells.at(-1));
});

test("PDF VIEWER tidak membocorkan rincian transaksi kas dan pembayaran pajak", () => {
  const state = demoState();
  state.Transaksi[0].deskripsi = "RAHASIA-NAMA-SISWA-UNTUK-UJI";
  const owner = document(state, { kind: "cash" }), viewer = document(state, { kind: "cash", role: "VIEWER" });
  assert.match(JSON.stringify(owner), /RAHASIA-NAMA-SISWA/);
  assert.doesNotMatch(JSON.stringify(viewer), /RAHASIA-NAMA-SISWA/);
  assert.equal(viewer.tables.length, 1);
  assert.equal(document(state, { kind: "tax", role: "VIEWER" }).tables.length, 1);
  assert.equal(document(state, { kind: "tax", role: "OWNER" }).tables.length, 2);
});

test("PDF menolak tanggal kalender, rekening, dan rentang yang tidak valid", () => {
  const state = demoState();
  for (const [from, to] of [["2026-10-31", "2026-10-01"], ["2026-02-30", "2026-03-01"], ["0001-01-01", "0001-01-31"], ["2020-01-01", "2030-01-01"]]) {
    assert.equal(validReportRange(from, to), false);
    assert.throws(() => document(state, { from, to }));
  }
  assert.throws(() => document(state, { kind: "cash", accountId: "akun-tidak-ada" }), /rekening/);
});

test("status Draf dan Proyeksi serta tarif kosong tidak berubah menjadi laporan final", () => {
  const state = demoState();
  const future = document(state, { generatedAt: "2026-10-21T00:00:00Z" });
  assert.match(future.status, /PROYEKSI/);
  assert.ok(future.warnings.some(w => /belum berakhir/.test(w)));
  state.Tarif_Pajak = [];
  const incomplete = document(state, { kind: "tax", simulation: false });
  assert.equal(incomplete.status, "DRAF");
  assert.ok(incomplete.warnings.some(w => /Tarif/.test(w)));
  assert.ok(incomplete.tables[0].rows[0].cells.includes("Belum lengkap"));
  assert.equal(incomplete.source, "Google Sheets");
});

test("jadwal aset PDF memisahkan nilai periode dari proyeksi tahunan yang terbaca", () => {
  const model = document(demoState(), { kind: "assets", from: "2026-10-01", to: "2026-10-20" });
  assert.equal(model.tables.length, 3);
  assert.equal(model.tables[0].rows[0].cells[5], "0");
  assert.equal(model.tables[2].rows[0].cells.at(-1), "300.000");
  assert.match(model.tables[2].note || "", /proyeksi/);
});

test("renderer membuat PDF sungguhan dengan font tertanam untuk enam jenis dan tabel panjang", () => {
  const fonts = {
    regular: new Uint8Array(readFileSync(new URL("../public/fonts/terrace-report-regular.ttf", import.meta.url))),
    bold: new Uint8Array(readFileSync(new URL("../public/fonts/terrace-report-bold.ttf", import.meta.url))),
  };
  const outputDir = process.env.PDF_QA_DIR;
  if (outputDir) mkdirSync(outputDir, { recursive: true });
  for (const kind of Object.keys(PDF_REPORT_TITLES) as PdfReportKind[]) {
    const model = document(demoState(), { kind }), bytes = renderReportPdf(model, fonts);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    assert.match(new TextDecoder().decode(bytes.slice(-50)), /%%EOF/);
    assert.ok(bytes.length > 10000, "Font PDF tertanam");
    if (outputDir) writeFileSync(join(outputDir, kind + ".pdf"), bytes);
  }
  const state = demoState(), original = state.Transaksi.find(tx => tx.jenis === "BIAYA")!;
  for (let i = 0; i < 180; i++) state.Transaksi.push({ ...original, transaksi_id: "pdf-qa-" + i, tanggal_transaksi: "2026-10-20", nominal: 1000 + i, deskripsi: "UJI HALAMAN PANJANG " + i + " - Pembelian peralatan dan kebutuhan kegiatan belajar; rincian transaksi harus terbungkus dan tetap utuh sampai akhir tabel." });
  const long = document(state, { kind: "cash" });
  const bytes = renderReportPdf(long, fonts);
  assert.ok(bytes.length > 40000);
  if (outputDir) writeFileSync(join(outputDir, "cash-multipage.pdf"), bytes);
});

test("font PDF yang gagal dimuat dapat dicoba ulang tanpa menahan unduhan berikutnya", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("", { status: 503 });
    await assert.rejects(loadReportFonts(), /Periksa koneksi/);
    globalThis.fetch = async () => new Response(new Uint8Array([0, 1, 2, 3]));
    const loaded = await loadReportFonts();
    assert.equal(loaded.regular.length, 4); assert.equal(loaded.bold.length, 4);
  } finally { globalThis.fetch = originalFetch; }
});
