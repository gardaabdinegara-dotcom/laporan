import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyCommand, demoState, initialState, upgradeState, validateState, type Actor, type Row, type State } from "../lib/domain.ts";
import { assetDepreciation, assetPeriodExpense, cashbook, financialStatements, mappingAt, reportCSV, taxReport } from "../lib/reporting.ts";
const owner: Actor = { id: "owner", name: "Pemilik", email: "owner@example.test", role: "OWNER" };
const mutate = (s: State, action: string, data: Record<string, unknown>, actor = owner) => applyCommand(s, { operationId: randomUUID(), action, data }, actor).state;
const report = (s: State, from = "2026-10-01", to = "2026-10-31") => financialStatements(s, from, to);
function expense(s: State, amount = 120000, date = "2026-10-15") {
  return mutate(s, "transaction.create", { jenis: "BIAYA", akun_id: "bank", nominal: amount, kategori_id: "operasional", tanggal_transaksi: date, deskripsi: "Pembelian peralatan" });
}
function purchase(s: State) {
  const next = expense(s);
  const tx = next.Transaksi.at(-1)!;
  return mutate(next, "report.asset", { nama_aset: "Printer", sumber: "TRANSAKSI", transaksi_id: tx.transaksi_id, tanggal_perolehan: tx.tanggal_transaksi, harga_perolehan: 120000, tanggal_mulai: "2026-10-01", umur_bulan: 3, nilai_residu: 0, akumulasi_awal: 0 });
}
test("buku kas saldo berjalan, transfer gabungan neto nol, saldo akun mandiri", () => {
  const s = demoState(), all = cashbook(s, "2026-10-01", "2026-10-31"), bank = cashbook(s, "2026-10-01", "2026-10-31", "bank");
  assert.equal(all.opening, 3000000); assert.equal(all.incoming, 2750000); assert.equal(all.outgoing, 300000);
  assert.equal(all.closing, 5450000); assert.equal(all.difference, 0); assert.equal(all.lines.at(-1)?.balance, 5450000);
  assert.equal(all.lines.filter(l => l.internal).length, 2);
  assert.equal(bank.incoming, 2650000); assert.equal(bank.closing, 4650000); assert.equal(bank.difference, 0);
});
test("saldo akhir Desember menjadi saldo awal Januari tanpa omzet ganda", () => {
  const s = demoState(), december = cashbook(s, "2026-12-01", "2026-12-31"), january = cashbook(s, "2027-01-01", "2027-01-31");
  assert.equal(december.closing, january.opening); assert.equal(january.incoming, 0); assert.equal(january.outgoing, 0);
});
test("transaksi pada tanggal sama mempertahankan urutan penyimpanan", () => {
  let s = demoState();
  s = expense(s, 10000, "2026-10-15"); s = expense(s, 20000, "2026-10-15");
  const lines = cashbook(s, "2026-10-15", "2026-10-15").lines;
  assert.equal(lines[0].outgoing, 10000); assert.equal(lines[1].outgoing, 20000); assert.equal(lines[1].balance, lines[0].balance - 20000);
});
test("akun baru di tengah periode memisahkan pembukaan dari pemasukan", () => {
  const s = mutate(demoState(), "master.save", { table: "Akun", nama_akun: "Kas baru", jenis_akun: "KAS", saldo_awal: 50000, tanggal_saldo_awal: "2026-10-20" });
  const book = cashbook(s, "2026-10-01", "2026-10-31");
  assert.equal(book.additionalOpening, 50000); assert.equal(book.incoming, 2750000); assert.equal(book.closing, 5500000); assert.equal(book.difference, 0);
  assert.ok(book.warnings.length); assert.equal(report(s).ready, false);
});
test("laba rugi dan neraca memakai sumber sama; penyusutan tidak mengurangi kas", () => {
  const s = demoState(), r = report(s);
  validateState(s);
  assert.equal(r.income, 750000); assert.equal(r.directCosts, 300000);
  assert.equal(r.period.PENYUSUTAN, 100000); assert.equal(r.netProfit, 350000);
  assert.equal(r.assetTotal, 6550000); assert.equal(r.equity, 6550000);
  assert.equal(r.assets[0].book, 1100000); assert.equal(r.ready, true);
  assert.ok(r.checks.every(c => c.difference === 0)); assert.equal(cashbook(s, r.from, r.to).closing, 5450000);
});
test("neraca tahun berikutnya membawa laba tahun sebelumnya ke laba ditahan", () => {
  const s = demoState(), december = report(s, "2026-10-01", "2026-12-31"), january = report(s, "2027-01-01", "2027-01-31");
  assert.equal(december.netProfit, 150000); assert.equal(january.retained, 150000); assert.equal(january.currentProfit, -100000);
  assert.ok(january.checks.every(c => c.difference === 0));
});
test("pembelian aset ditautkan tanpa kas kedua dan biaya direklasifikasi", () => {
  const before = expense(demoState()), after = purchase(demoState());
  assert.equal(before.Transaksi.length, after.Transaksi.length);
  assert.equal(cashbook(before, "2026-10-01", "2026-10-31").closing, cashbook(after, "2026-10-01", "2026-10-31").closing);
  const r = report(after);
  assert.equal(r.period.BIAYA_LAIN, 0); assert.equal(r.period.PENYUSUTAN, 140000); assert.equal(r.netProfit, 310000);
  assert.ok(r.checks.every(c => c.difference === 0));
});
test("aset menolak tautan ganda, harga berbeda, pajak tertaut, atau tanggal tidak cocok", () => {
  const s = purchase(demoState()), a = s.Aset.at(-1)!;
  assert.throws(() => mutate(s, "report.asset", { ...a, nama_aset: "Ganda" }), /sudah ditautkan/);
  assert.throws(() => mutate(s, "report.asset", { ...a, id: a.aset_id, harga_perolehan: 999 }), /harga dan tanggal/);
  assert.throws(() => mutate(s, "report.tax.payment", { transaksi_id: a.transaksi_id, periode_pajak: "2025", perlakuan: "BEBAN", catatan: "Salah" }), /tidak valid|ganda/);
});
test("penyusutan akhir bulan, pembulatan kumulatif, residu, dan akhir umur", () => {
  const s = purchase(demoState()), asset = s.Aset.at(-1)!;
  asset.harga_perolehan = 100; asset.nilai_residu = 1;
  assert.equal(assetDepreciation(s, asset, "2026-10-30"), 0);
  assert.equal(assetDepreciation(s, asset, "2026-10-31"), 33);
  assert.equal(assetDepreciation(s, asset, "2026-11-30"), 66);
  assert.equal(assetDepreciation(s, asset, "2026-12-31"), 99);
  assert.equal(assetDepreciation(s, asset, "2028-12-31"), 99);
  assert.equal(["2026-10", "2026-11", "2026-12"].reduce((total, m) => total + assetPeriodExpense(s, asset, m + "-01", m === "2026-11" ? m + "-30" : m + "-31"), 0), 99);
});
test("pembalik pembelian membalik aset dan penyusutan pada tanggal efektif tanpa mengubah masa lalu", () => {
  const s = purchase(demoState()), a = s.Aset.at(-1)!;
  const reversed = mutate(s, "transaction.reverse", { transaksi_id: a.transaksi_id, tanggal_transaksi: "2026-11-05", alasan: "Pembelian dibatalkan" });
  assert.equal(report(reversed).netProfit, report(s).netProfit);
  const nov = report(reversed, "2026-11-01", "2026-11-30");
  assert.equal(nov.assets.find(row => row.asset.aset_id === a.aset_id)?.cost, 0);
  assert.equal(nov.period.PENYUSUTAN, 60000);
  assert.ok(nov.checks.every(c => c.difference === 0));
});
test("jurnal piutang menyesuaikan pendapatan dan neraca tanpa menciptakan kas", () => {
  const s = demoState(), updated = mutate(s, "report.journal", { tanggal: "2026-10-20", deskripsi: "Pendapatan jasa belum dibayar", lines: [{ akun_laporan: "PIUTANG", debit: 200000, kredit: 0 }, { akun_laporan: "PENDAPATAN", debit: 0, kredit: 200000 }] });
  assert.equal(cashbook(updated, "2026-10-01", "2026-10-31").closing, 5450000);
  assert.equal(report(updated).income, 950000); assert.equal(report(updated).balances.PIUTANG, 200000);
  assert.ok(report(updated).checks.every(c => c.difference === 0));
});
test("jurnal tidak seimbang dan jurnal kas ditolak tanpa memutasi sumber", () => {
  const s = demoState(), snapshot = JSON.stringify(s);
  assert.throws(() => mutate(s, "report.journal", { tanggal: "2026-10-20", deskripsi: "Tidak cocok", lines: [{ akun_laporan: "PIUTANG", debit: 200000 }, { akun_laporan: "PENDAPATAN", kredit: 100000 }] }), /harus sama/);
  assert.throws(() => mutate(s, "report.journal", { tanggal: "2026-10-20", deskripsi: "Kas tidak sah", lines: [{ akun_laporan: "KAS_BANK", debit: 100000 }, { akun_laporan: "PENDAPATAN", kredit: 100000 }] }), /Kas dan aset/);
  assert.equal(JSON.stringify(s), snapshot);
});
test("pembalik jurnal memiliki tanggal efektif dan tidak dapat berulang", () => {
  const s = mutate(demoState(), "report.journal", { tanggal: "2026-10-20", deskripsi: "Piutang", lines: [{ akun_laporan: "PIUTANG", debit: 200000 }, { akun_laporan: "PENDAPATAN", kredit: 200000 }] }), id = s.Jurnal_Laporan[0].jurnal_id;
  const r = mutate(s, "report.journal.reverse", { jurnal_id: id, tanggal: "2026-11-01", deskripsi: "Koreksi piutang" });
  assert.equal(report(r).income, 950000); assert.equal(report(r, "2026-11-01", "2026-11-30").income, -200000);
  assert.throws(() => mutate(r, "report.journal.reverse", { jurnal_id: id, tanggal: "2026-11-02", deskripsi: "Lagi" }), /tidak dapat dibalik/);
  validateState(r);
});
test("tagihan yang belum dibayar tidak otomatis menjadi piutang akuntansi", () => {
  const s = demoState();
  assert.equal(report(s).balances.PIUTANG, 0);
  assert.equal(report(s).income, 750000);
});
test("laporan kosong atau tanpa dasar/pemetaan tetap draf", () => {
  const s = initialState("owner@example.test", "2026-10-01");
  assert.equal(report(s).ready, false);
  const unmapped = demoState(); unmapped.Pemetaan_Laporan = [];
  assert.equal(report(unmapped).ready, false); assert.ok(report(unmapped).warnings.some(w => /belum dipetakan/.test(w)));
  assert.equal(report(unmapped).netProfit, 350000); // Unmapped expenses remain visible in the provisional result.
});
test("pembukaan seimbang disimpan, selisih tidak dijadikan modal otomatis", () => {
  let s = demoState();
  s.Saldo_Neraca = [];
  assert.throws(() => mutate(s, "report.opening", { balances: {}, verified: true, sumber: "Tidak lengkap" }), /belum seimbang/);
  s = mutate(s, "report.opening", { balances: { MODAL: 4200000 }, verified: true, sumber: "Kas dan aset diverifikasi" });
  assert.equal(report(s).ready, true);
  const edited = mutate(s, "report.asset", { ...s.Aset[0], id: s.Aset[0].aset_id, harga_perolehan: 1500000 });
  assert.equal(report(edited).ready, false); assert.ok(report(edited).warnings.some(w => /berubah setelah verifikasi/.test(w)));
});
test("versi pemetaan berlaku prospektif dan periode tertutup melindungi laporan", () => {
  let s = demoState();
  s = mutate(s, "report.mapping", { berlaku_mulai: "2026-11-01", mappings: [{ kategori_id: "honor", kelompok: "GAJI" }] });
  assert.equal(mappingAt(s, "honor", "2026-10-31"), "BIAYA_JASA"); assert.equal(mappingAt(s, "honor", "2026-11-01"), "GAJI");
  s.Pengaturan.find(r => r.key === "closed_periods")!.value = '["2026-10"]';
  assert.throws(() => mutate(s, "report.mapping", { berlaku_mulai: "2026-10-01", mappings: [{ kategori_id: "honor", kelompok: "GAJI" }] }), /ditutup/);
  assert.throws(() => mutate(s, "report.asset", { ...s.Aset[0], id: s.Aset[0].aset_id }), /ditutup/);
  assert.throws(() => mutate(s, "report.opening", { balances: { MODAL: 4200000 }, verified: true, sumber: "Ulang" }), /ditutup/);
});
test("dasar laporan memerlukan penetapan pemilik dan terkunci sesudah penutupan", () => {
  const s = demoState();
  assert.throws(() => mutate(s, "report.profile", { tanggal_mulai: "2026-10-01", basis: "KAS_DISESUAIKAN" }), /Konfirmasi/);
  s.Pengaturan.find(r => r.key === "closed_periods")!.value = '["2026-10"]';
  assert.throws(() => mutate(s, "report.profile", { tanggal_mulai: "2026-10-01", basis: "KAS_DISESUAIKAN", dasar_pajak: "PENDAPATAN_BERSIH", confirmed: true }), /ditutup/);
});
test("seluruh pengaturan laporan ditolak untuk ADMIN dan VIEWER", () => {
  for (const role of ["ADMIN", "VIEWER"] as const) for (const action of ["report.profile", "report.mapping", "report.asset", "report.opening", "report.journal", "report.journal.reverse", "report.tax.rate", "report.tax.payment"])
    assert.throws(() => mutate(demoState(), action, {}, { ...owner, role }), /pemilik|pembaca/);
});
test("operation ID laporan menjaga satu dampak saat retry", () => {
  const s = demoState(), command = { operationId: randomUUID(), action: "report.tax.rate", data: { berlaku_mulai: "2026-11-01", tarif_basis_poin: 100, catatan: "Tarif baru contoh" } };
  const a = applyCommand(s, command, owner).state, b = applyCommand(a, command, owner).state;
  assert.equal(a.Tarif_Pajak.length, b.Tarif_Pajak.length);
});
test("tarif berversi, tarif nol sah, dan data belum diatur bukan nol", () => {
  const s = demoState();
  assert.equal(taxReport(s, "2026-10-01", "2026-10-31").total, 3750);
  const next = mutate(s, "report.tax.rate", { berlaku_mulai: "2026-11-01", tarif_basis_poin: 0, catatan: "Tarif nol untuk pengujian" });
  assert.equal(taxReport(next, "2026-10-01", "2026-10-31").total, 3750);
  assert.equal(taxReport(next, "2026-11-01", "2026-11-30").total, 0);
  const missing = demoState(); missing.Tarif_Pajak = [];
  assert.equal(taxReport(missing, "2026-10-01", "2026-10-31").total, null);
  assert.equal(taxReport(missing, "2026-10-01", "2026-10-31").ready, false);
});
test("pembayaran pajak tahun berbeda ditautkan tanpa transaksi kas kedua", () => {
  const s = expense(demoState(), 88000), tx = s.Transaksi.at(-1)!;
  const updated = mutate(s, "report.tax.payment", { transaksi_id: tx.transaksi_id, periode_pajak: "2025", perlakuan: "BEBAN", catatan: "Pajak tahun sebelumnya" });
  assert.equal(updated.Transaksi.length, s.Transaksi.length);
  const tax = taxReport(updated, "2026-10-01", "2026-10-31");
  assert.equal(tax.payments[0].periode_pajak, "2025"); assert.equal(tax.rows[0].paid, 0);
  assert.equal(report(updated).period.PAJAK, 88000);
});
test("pelunasan utang pajak tidak menggandakan beban pajak", () => {
  let s = expense(demoState(), 88000), tx = s.Transaksi.at(-1)!;
  s = mutate(s, "report.journal", { tanggal: "2026-10-10", deskripsi: "Pajak terutang", lines: [{ akun_laporan: "PAJAK", debit: 88000 }, { akun_laporan: "UTANG_PAJAK", kredit: 88000 }] });
  s = mutate(s, "report.tax.payment", { transaksi_id: tx.transaksi_id, periode_pajak: "2026-10", perlakuan: "PELUNASAN_UTANG", catatan: "Pelunasan" });
  assert.equal(report(s).period.PAJAK, 88000); assert.equal(report(s).balances.UTANG_PAJAK, 0); assert.equal(taxReport(s, "2026-10-01", "2026-10-31").rows[0].paid, 88000);
  assert.ok(report(s).checks.every(c => c.difference === 0));
});
test("CSV menetralkan formula teks dan mempertahankan angka negatif numerik", () => {
  const csv = reportCSV([["=HYPERLINK(\"bad\")", "@formula", "  +formula", -100, 250, null]]);
  assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes("'@formula")); assert.ok(csv.includes("'  +formula"));
  assert.ok(csv.includes(",-100,250,")); assert.ok(csv.startsWith("\uFEFF"));
});
test("upgrade backup versi 1 menambahkan tabel tanpa mengubah ID dan nominal", () => {
  const original = demoState(), old = structuredClone(original);
  for (const key of ["Aset", "Pemetaan_Laporan", "Saldo_Neraca", "Jurnal_Laporan", "Tarif_Pajak", "Pembayaran_Pajak"]) delete (old as unknown as Record<string, unknown>)[key];
  old.Pengaturan = old.Pengaturan.filter(r => !/reporting_|tax_basis|report_/.test(String(r.key)));
  old.Pengaturan.find(r => r.key === "schema_version")!.value = "1";
  const upgraded = upgradeState(old);
  validateState(upgraded);
  assert.deepEqual(upgraded.Transaksi, original.Transaksi); assert.deepEqual(upgraded.Tagihan, original.Tagihan);
  assert.equal(upgraded.Aset.length, 0); assert.equal(upgraded.Pengaturan.find(r => r.key === "schema_version")!.value, "2");
  assert.equal(old.Pengaturan.find(r => r.key === "schema_version")!.value, "1");
});
test("akun dengan saldo awal baru tidak boleh menyisipkan nilai ke periode tertutup", () => {
  const s = demoState(); s.Pengaturan.find(r => r.key === "closed_periods")!.value = '["2026-10"]';
  assert.throws(() => mutate(s, "master.save", { table: "Akun", nama_akun: "Sisipan", jenis_akun: "KAS", saldo_awal: 100, tanggal_saldo_awal: "2026-09-01" }), /ditutup/);
});
test("versi data yang lebih baru tidak diturunkan diam-diam", () => {
  const s = demoState(); s.Pengaturan.find(r => r.key === "schema_version")!.value = "3";
  assert.throws(() => validateState(s), /Versi struktur/); assert.throws(() => upgradeState(s), /Versi struktur/);
});
test("jumlah nominal besar ditolak sebelum kehilangan presisi rupiah", () => {
  const s = initialState("owner@example.test", "2026-10-01");
  s.Transaksi = Array.from({ length: 5000 }, (_, i) => ({ transaksi_id: "large-" + i, operation_id: "large-" + i, line_no: 1, tanggal_transaksi: "2026-10-01", jenis: "PENERIMAAN_LAIN", arah: "IN", akun_id: "cash", kategori_id: "lain", nominal: 1000000000000 }));
  assert.throws(() => validateState(s), /batas perhitungan rupiah/);
});
test("contoh 2025: omzet, biaya, penyusutan, dan saldo dihitung bersama dari fixture terisolasi", () => {
  // Amounts mirror the provided examples to expose the Rp800,000 source discrepancy.
  // They are test data only; this fixture is never imported by the operational app.
  const s = initialState("owner@example.test", "2025-01-01");
  s.Akun[0].saldo_awal = 19820000;
  s.Pengaturan.push({ key: "reporting_start", value: "2025-01-01" }, { key: "reporting_basis", value: "KAS_DISESUAIKAN" }, { key: "tax_basis", value: "KAS_BRUTO" });
  const groups = ["PENDAPATAN", "BIAYA_JASA", "UTILITAS", "PEMELIHARAAN", "PEMASARAN", "PAJAK", "ASET_TETAP"];
  s.Kategori = groups.map((g, i) => ({ kategori_id: "cat-" + i, nama_kategori: g, jenis_yang_diizinkan: i === 0 ? "PENERIMAAN_LAIN" : "BIAYA", aktif: true }));
  s.Pemetaan_Laporan = groups.map((g, i) => ({ pemetaan_id: "map-" + i, kategori_id: "cat-" + i, kelompok: g, berlaku_mulai: "2025-01-01" }));
  const receipts = [10000000,11000000,0,20000000,10500000,1000000,10000000,10500000,20500000,20000000,10500000,10500000];
  const direct = [10650000,10800000,0,11000000,11400000,10500000,10500000,10500000,10500000,10500000,10500000,11500000];
  const utilities = [1150000,1050000,1200000,1100000,1250000,1000000,1150000,1300000,1050000,1200000,1100000,1350000];
  let seq = 0;
  const add = (date: string, amount: number, group: number) => {
    const id = "fixture-" + ++seq;
    if (amount) s.Transaksi.push({ transaksi_id: id, operation_id: id, line_no: 1, akun_id: "cash", tanggal_transaksi: date, jenis: group === 0 ? "PENERIMAAN_LAIN" : "BIAYA", arah: group === 0 ? "IN" : "OUT", nominal: amount, kategori_id: "cat-" + group, deskripsi: "Fixture " + groups[group] });
    return id;
  };
  const monthEnds = ["31","28","31","30","31","30","31","31","30","31","30","31"];
  for (let i = 0; i < 12; i++) {
    const date = "2025-" + String(i + 1).padStart(2, "0") + "-" + monthEnds[i];
    add(date, receipts[i], 0); add(date, direct[i], 1); add(date, utilities[i], 2);
  }
  add("2025-04-12", 600000, 3); add("2025-07-10", 350000, 3); add("2025-12-10", 800000, 4);
  const taxId = add("2025-06-06", 880000, 5), newAsset = add("2025-06-12", 1500000, 6), clothing = add("2025-10-10", 3000000, 6);
  s.Pembayaran_Pajak.push({ pembayaran_id: "tax-2024", transaksi_id: taxId, periode_pajak: "2024", perlakuan: "BEBAN" });
  const initialAssets: [number, number, string][] = [[3750000,1015625,"2023-12-21"],[1000000,270833,"2023-12-21"],[1000000,250000,"2024-05-17"],[2600000,650000,"2024-07-01"],[16000000,4000000,"2024-12-16"],[9800000,2450000,"2024-12-19"],[5300000,1325000,"2024-12-21"]];
  s.Aset = initialAssets.map(([cost, accumulated, date], i) => ({ aset_id: "initial-" + i, nama_aset: "Aset awal " + i, sumber: "SALDO_AWAL", transaksi_id: "", tanggal_perolehan: date, tanggal_mulai: date.slice(0, 7) + "-01", tanggal_saldo_awal: "2025-01-01", harga_perolehan: cost, nilai_residu: 0, umur_bulan: 48, akumulasi_awal: accumulated }));
  for (const [id, amount, date] of [[newAsset,1500000,"2025-06-12"],[clothing,3000000,"2025-10-10"]] as [string, number, string][]) s.Aset.push({ aset_id: id + "-asset", nama_aset: "Pembelian " + id, sumber: "TRANSAKSI", transaksi_id: id, tanggal_perolehan: date, tanggal_mulai: date.slice(0, 7) + "-01", harga_perolehan: amount, nilai_residu: 0, umur_bulan: 48, akumulasi_awal: 0 });
  s.Saldo_Neraca = [["KAS_BANK",19820000,0],["ASET_TETAP",39450000,0],["AKUM_PENYUSUTAN",0,9961458],["LABA_DITAHAN",0,49308542]].map(([account, debit, credit], i) => ({ saldo_id: "opening-" + i, versi: 1, tanggal: "2025-01-01", akun_laporan: account, debit, kredit: credit, sumber: "Fixture" }));
  s.Tarif_Pajak = [{ tarif_id: "rate", berlaku_mulai: "2025-01-01", tarif_basis_poin: 50 }];
  validateState(s);
  const r = report(s, "2025-01-01", "2025-12-31"), book = cashbook(s, r.from, r.to), tax = taxReport(s, r.from, r.to);
  assert.equal(r.income, 134500000); assert.equal(r.directCosts, 118350000); assert.equal(r.period.UTILITAS, 13900000);
  assert.equal(r.period.PENYUSUTAN, 10268750); assert.equal(r.netProfit, -10648750);
  assert.equal(-r.balances.AKUM_PENYUSUTAN, 20230208); assert.equal(r.balances.ASET_TETAP, 43950000);
  assert.equal(book.outgoing, 139380000); assert.equal(book.closing, 14940000);
  assert.equal(book.closing - 14140000, 800000); assert.equal(r.assetTotal, 38659792);
  assert.equal(tax.total, 672500); assert.equal(tax.payments[0].periode_pajak, "2024");
  assert.equal(r.ready, true); assert.ok(r.checks.every(c => c.difference === 0));
});
