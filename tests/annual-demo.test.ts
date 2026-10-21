import { test } from "node:test";
import assert from "node:assert/strict";
import { annualDemoState, ANNUAL_DEMO_ID, ANNUAL_RECEIPTS } from "../lib/annual-demo.ts";
import { demoState, invoiceSummary, num, setting, validateState } from "../lib/domain.ts";
import { assetDepreciation, cashbook, financialStatements, monthEnd, monthIndex, taxReport } from "../lib/reporting.ts";
import { buildReportDocument } from "../lib/report-document.ts";

test("contoh tahunan valid, deterministik, dan tidak mengubah contoh singkat", () => {
  const brief = demoState(), before = JSON.stringify(brief), first = annualDemoState(), second = annualDemoState();
  validateState(first);
  assert.deepEqual(first, second);
  first.Transaksi[0].deskripsi = "Diubah pada satu workspace";
  assert.notEqual(first.Transaksi[0].deskripsi, second.Transaksi[0].deskripsi);
  assert.equal(JSON.stringify(brief), before);
  assert.equal(setting(second, "demo_scenario"), ANNUAL_DEMO_ID);
  assert.equal(second.Siswa.length, 16); assert.equal(second.Tagihan.length, 60);
  assert.equal(second.Transaksi.length, 178); assert.equal(second.Aset.length, 9);
  assert.ok(second.Siswa.every(s => s.no_wa === "" && String(s.catatan).includes("fiktif")));
});

test("dua belas bulan lengkap, saldo bergulir, dan saldo setiap rekening tidak negatif", () => {
  const s = annualDemoState();
  for (let i = 0; i < 12; i++) {
    const month = "2025-" + String(i + 1).padStart(2, "0");
    const b = cashbook(s, month + "-01", monthEnd(month));
    assert.equal(b.incoming, ANNUAL_RECEIPTS[i]);
    assert.equal(b.opening + b.incoming - b.outgoing, b.closing);
    assert.equal(b.difference, 0);
    if (i) {
      const previous = "2025-" + String(i).padStart(2, "0");
      assert.equal(cashbook(s, previous + "-01", monthEnd(previous)).closing, b.opening);
    }
    for (const account of ["cash", "bank"]) {
      const part = cashbook(s, month + "-01", monthEnd(month), account);
      assert.ok(part.lines.every(l => l.balance >= 0));
      assert.equal(part.difference, 0);
    }
  }
});

test("laba, kas, aset, dan neraca tahunan berasal dari catatan yang sama", () => {
  const s = annualDemoState(), r = financialStatements(s, "2025-01-01", "2025-12-31"), b = cashbook(s, r.from, r.to);
  assert.equal(r.income, 134500000); assert.equal(r.directCosts, 75600000);
  assert.equal(r.period.UTILITAS, 13900000); assert.equal(r.period.PENYUSUTAN, 10268750);
  assert.equal(r.period.PAJAK, 672500); assert.equal(r.netProfit, 5908750);
  assert.equal(b.opening, 19820000); assert.equal(b.outgoing, 123702500); assert.equal(b.closing, 30617500);
  assert.equal(r.balances.ASET_TETAP, 43950000); assert.equal(r.balances.AKUM_PENYUSUTAN, -12694792);
  assert.equal(r.assetTotal, 61872708); assert.equal(r.equity, r.assetTotal); assert.ok(r.liabilities === 0);
  assert.ok(r.checks.every(c => c.difference === 0)); assert.equal(r.ready, true);
});

test("pembukaan aset mengikuti bulan perolehan dan pembelian tidak menjadi biaya kedua", () => {
  const s = annualDemoState();
  for (const a of s.Aset.filter(a => a.sumber === "SALDO_AWAL")) {
    const consumed = monthIndex("2025-01-01") - monthIndex(String(a.tanggal_mulai));
    assert.equal(a.akumulasi_awal, Math.round(num(a, "harga_perolehan") * consumed / num(a, "umur_bulan")));
    assert.equal(assetDepreciation(s, a, "2025-01-01"), a.akumulasi_awal);
  }
  for (const a of s.Aset.filter(a => a.sumber === "TRANSAKSI")) {
    const purchases = s.Transaksi.filter(tx => tx.transaksi_id === a.transaksi_id);
    assert.equal(purchases.length, 1); assert.equal(purchases[0].nominal, a.harga_perolehan);
  }
  assert.equal(financialStatements(s, "2025-01-01", "2025-12-31").period.BELUM_DIPETAKAN, 0);
});

test("pajak tahun 2024 dipisahkan dan pajak 2025 dibebankan sekali sebelum pelunasan", () => {
  const s = annualDemoState(), t = taxReport(s, "2025-01-01", "2025-12-31");
  assert.equal(t.total, 672500);
  assert.equal(t.rows.reduce((sum, r) => sum + r.paid, 0), 672500);
  assert.equal(t.payments.reduce((sum, p) => sum + p.amount, 0), 1552500);
  assert.equal(t.payments.filter(p => p.periode_pajak === "2024")[0].amount, 880000);
  assert.deepEqual(t.payments.map(p => p.date), t.payments.map(p => p.date).sort());
  assert.equal(financialStatements(s, "2025-01-01", "2025-06-01").balances.UTANG_PAJAK, -880000);
  assert.equal(financialStatements(s, "2025-01-01", "2025-12-31").period.PAJAK, 672500);
});

test("tagihan dan cicilan fiktif terhubung serta lunas pada akhir tahun", () => {
  const s = annualDemoState();
  assert.ok(s.Tagihan.every(i => invoiceSummary(s, i, "2025-12-31").remaining === 0));
  assert.equal(s.Jadwal_Tagihan.length, 64);
  assert.equal(s.Transaksi.filter(tx => tx.jenis === "PEMBAYARAN_SISWA").reduce((sum, tx) => sum + num(tx, "nominal"), 0), 134500000);
});

test("dokumen tahunan memakai dua belas halaman bulan dan lampiran yang dipisah", () => {
  const s = annualDemoState(), options = { from: "2025-01-01", to: "2025-12-31", role: "OWNER" as const, simulation: true, dataAsOf: "2026-10-21T01:00:00Z", generatedAt: "2026-10-21T01:00:00Z" };
  const cash = buildReportDocument(s, { ...options, kind: "cash" });
  assert.equal(cash.tables.length, 13);
  assert.equal(cash.tables[0].pageBreak, false);
  assert.ok(cash.tables.slice(1).every(t => t.pageBreak === true));
  const tax = buildReportDocument(s, { ...options, kind: "tax" });
  assert.equal(tax.tables[1].pageBreak, true);
  assert.equal(tax.tables[1].rows.at(-1)?.cells.at(-1), "1.552.500");
  assert.equal(cash.status, "DATA CONTOH | SIAP DIPERIKSA");
  assert.equal(buildReportDocument(s, { ...options, kind: "assets" }).tables.filter(t => t.pageBreak).length, 2);
});
