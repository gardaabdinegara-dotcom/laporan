import { initialState, type Row, type State } from "./domain.ts";
import { monthIndex, type ReportAccount } from "./reporting.ts";

export const ANNUAL_DEMO_YEAR = "2025";
export const ANNUAL_DEMO_ID = "annual-2025-v1";
export const ANNUAL_DEMO_KEY = "garda.keuangan.demo.annual-2025.v1";
export const DEMO_SCENARIO_KEY = "garda.keuangan.demo.scenario.v1";
export const ANNUAL_RECEIPTS = [10000000, 11000000, 9000000, 12000000, 10500000, 11000000, 10000000, 10500000, 12500000, 14000000, 11500000, 12500000];
const directCosts = [5500000, 5800000, 5700000, 6000000, 6200000, 6300000, 6200000, 6400000, 6500000, 7000000, 6800000, 7200000];
const utilities = [1150000, 1050000, 1200000, 1100000, 1250000, 1000000, 1150000, 1300000, 1050000, 1200000, 1100000, 1350000];
const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** Deterministic, isolated sample. Never imported into the operational Sheets. */
export function annualDemoState(): State {
  const s = initialState("simulasi@example.test", "2025-01-01");
  s.Pengguna[0].nama = "Pengelola simulasi";
  s.Akun[0].saldo_awal = 4820000;
  s.Akun[1].saldo_awal = 15000000;
  s.Pengaturan.push(...Object.entries({
    demo_scenario: ANNUAL_DEMO_ID, demo_year: ANNUAL_DEMO_YEAR, demo_today: "2025-12-31",
    reporting_start: "2025-01-01", reporting_basis: "KAS_DISESUAIKAN", tax_basis: "KAS_BRUTO",
    report_location: "Kab. Gowa", report_signer: "Pengelola (simulasi)", report_position: "Direktur",
  }).map(([key, value]) => ({ key, value })));
  s.Program.forEach(p => { p.skema_default = "BULANAN"; p.tarif_default = 2000000; });
  s.Program.push({ program_id: "intensif", nama_program: "Paket Intensif Seleksi", target_seleksi: "UMUM", skema_default: "PAKET", tarif_default: 3000000, aktif: true });
  const categories: [string, string, ReportAccount][] = [
    ["honor", "Honor pengajar dan pelatih", "BIAYA_JASA"], ["utilitas", "Listrik, internet, dan air", "UTILITAS"],
    ["gaji", "Gaji staf administrasi", "GAJI"], ["sewa", "Sewa tempat", "SEWA"],
    ["operasional", "ATK dan kebutuhan kelas", "BIAYA_LAIN"], ["pemasaran", "Promosi dan pemasaran", "PEMASARAN"],
    ["pemeliharaan", "Pemeliharaan sarana", "PEMELIHARAAN"], ["pajak", "Pembayaran pajak", "PAJAK"],
    ["aset", "Pembelian aset", "ASET_TETAP"],
  ];
  const stamp = (date: string, operation = "SIM-SETUP-2025") => ({ operation_id: operation, created_at: date + "T08:00:00Z", created_by: "annual-demo" });
  s.Kategori = categories.map(([id, name]) => ({ kategori_id: id, nama_kategori: name, jenis_yang_diizinkan: "BIAYA", kelompok_arus: "OPERASIONAL", aktif: true }));
  s.Pemetaan_Laporan = categories.map(([id, , group]) => ({ pemetaan_id: "sim-map-" + id, kategori_id: id, kelompok: group, berlaku_mulai: "2025-01-01", ...stamp("2025-01-01") }));
  s.Tarif_Pajak = [{ tarif_id: "sim-tarif-2025", berlaku_mulai: "2025-01-01", tarif_basis_poin: 50, catatan: "Tarif 0,50% hanya asumsi simulasi, bukan penetapan kebijakan pajak usaha.", ...stamp("2025-01-01") }];
  let sequence = 0;
  function add(date: string, kind: string, account: string, direction: string, amount: number, description: string, extra: Row = {}) {
    const ref = "SIM-BK-" + String(++sequence).padStart(3, "0");
    const id = "annual-tx-" + sequence;
    s.Transaksi.push({ transaksi_id: id, line_no: 1, tanggal_transaksi: date, jenis: kind, akun_id: account, arah: direction, nominal: amount, deskripsi: description, ...stamp(date, ref), ...extra });
    return id;
  }
  const names = ["Raka Pratama", "Nadia Kirana", "Fajar Mahendra", "Alya Safira", "Dimas Saputra", "Nabila Putri", "Arga Wijaya", "Salma Nadhira", "Bima Santoso", "Zahra Aulia", "Rafi Ramadhan", "Kezia Maharani", "Farhan Akbar", "Dewi Lestari", "Rizal Aditya", "Citra Anindya"];
  s.Siswa = names.map((nama, i) => ({ siswa_id: "sim-siswa-" + i, nama, no_wa: "", nama_wali: "", no_wa_wali: "", tanggal_daftar: i < 4 ? "2025-01-01" : "2025-" + String(i - 3).padStart(2, "0") + "-01", aktif: true, catatan: "Identitas fiktif untuk simulasi satu tahun." }));
  s.Pendaftaran = names.map((_, i) => {
    const month = i < 4 ? "01" : String(i - 3).padStart(2, "0");
    return { pendaftaran_id: "sim-daftar-" + i, siswa_id: "sim-siswa-" + i, program_id: i < 4 ? i < 2 ? "tni" : "kedinasan" : "intensif",
      angkatan: "Simulasi 2025", tanggal_mulai: "2025-" + month + "-01", tanggal_selesai: "2025-12-31",
      skema_biaya: i < 4 ? "BULANAN" : "PAKET", tarif_disepakati: i < 4 ? 2000000 : ANNUAL_RECEIPTS[i - 4] - 8000000, hari_jatuh_tempo: 20, status: "AKTIF" };
  });
  function invoice(index: number, month: string, amount: number, installment = false) {
    const id = "sim-inv-" + month + "-" + index;
    const date = month + "-01";
    s.Tagihan.push({ tagihan_id: id, nomor_tagihan: "INV-" + month.replace("-", "") + "-" + String(index + 1).padStart(2, "0"), pendaftaran_id: "sim-daftar-" + index,
      jenis_tagihan: index < 4 ? "BULANAN" : "PAKET", periode_layanan: index < 4 ? month : "", tanggal_terbit: date,
      nominal_dasar: amount, diskon_awal: 0, ...stamp(date, "SIM-INV-" + month + "-" + index) });
    const count = installment ? 2 : 1;
    for (let part = 0; part < count; part++) s.Jadwal_Tagihan.push({ jadwal_id: id + "-" + part, tagihan_id: id, urutan: part + 1, jatuh_tempo: month + (part ? "-20" : "-10"), nominal: amount / count, ...stamp(date) });
    return id;
  }
  function expense(date: string, amount: number, category: string, description: string, account = "bank") {
    return add(date, "BIAYA", account, "OUT", amount, description, { kategori_id: category });
  }
  function taxPayment(date: string, amount: number, period: string) {
    const tx = expense(date, amount, "pajak", "Pelunasan pajak " + period);
    s.Pembayaran_Pajak.push({ pembayaran_id: "sim-taxpay-" + period, transaksi_id: tx, periode_pajak: period, perlakuan: "PELUNASAN_UTANG", catatan: "Pembayaran simulasi; satu transaksi kas, tidak dibebankan dua kali.", ...stamp(date) });
  }
  for (let m = 0; m < 12; m++) {
    const month = "2025-" + String(m + 1).padStart(2, "0"), label = monthNames[m];
    for (let i = 0; i < 4; i++) {
      const bill = invoice(i, month, 2000000);
      add(month + "-" + String(4 + i * 2).padStart(2, "0"), "PEMBAYARAN_SISWA", i === 0 ? "cash" : "bank", "IN", 2000000, "SPP " + label + " - " + names[i], { tagihan_id: bill });
    }
    const amount = ANNUAL_RECEIPTS[m] - 8000000, student = m + 4;
    const installments = [1, 5, 8, 11].includes(m);
    const bill = invoice(student, month, amount, installments);
    for (let part = 0; part < (installments ? 2 : 1); part++) add(month + (part ? "-20" : "-12"), "PEMBAYARAN_SISWA", "bank", "IN", amount / (installments ? 2 : 1), (installments ? "Cicilan " + (part + 1) + "/2" : "Paket intensif") + " - " + names[student], { tagihan_id: bill });
    expense(month + "-15", 2000000, "honor", "Honor pelatih - " + label, "cash");
    expense(month + "-16", directCosts[m] - 2000000, "honor", "Honor pengajar - " + label);
    expense(month + "-17", utilities[m], "utilitas", "Listrik, internet, air - " + label);
    expense(month + "-18", 1000000, "sewa", "Sewa ruang belajar - " + label);
    expense(month + "-22", 200000, "operasional", "ATK dan kebutuhan kelas - " + label, "cash");
    expense(month + "-24", 1000000, "gaji", "Gaji administrasi - " + label);
    const tax = Math.round(ANNUAL_RECEIPTS[m] * .005), journal = "SIM-JRN-PAJAK-" + month;
    s.Jurnal_Laporan.push(...[{ akun_laporan: "PAJAK", debit: tax, kredit: 0 }, { akun_laporan: "UTANG_PAJAK", debit: 0, kredit: tax }].map((line, i) => ({
      baris_id: journal + "-" + i, jurnal_id: journal, tanggal: month + "-25", ...line, deskripsi: "Beban pajak simulasi " + label, rujukan: "Rekap omzet " + month, jurnal_rujukan_id: "", ...stamp(month + "-25", journal),
    })));
    taxPayment(month + "-28", tax, month);
    const transferRef = "SIM-TRF-" + month;
    add(month + "-03", "TRANSFER_KELUAR", "bank", "OUT", 500000, "Isi kas operasional dari bank", { operation_id: transferRef });
    add(month + "-03", "TRANSFER_MASUK", "cash", "IN", 500000, "Isi kas operasional dari bank", { operation_id: transferRef, line_no: 2 });
  }
  expense("2025-04-14", 600000, "pemeliharaan", "Servis AC dan ruang kelas", "cash");
  expense("2025-07-14", 350000, "pemeliharaan", "Perawatan sarana latihan", "cash");
  expense("2025-09-14", 800000, "pemasaran", "Promosi penerimaan peserta");
  taxPayment("2025-06-26", 880000, "2024");
  const openingAssets: [string, number, string][] = [
    ["Kursi ruang belajar", 3750000, "2023-12-21"], ["Papan tulis", 1000000, "2023-12-21"],
    ["Tiang pull-up", 1000000, "2024-05-17"], ["Matras latihan", 2600000, "2024-07-01"],
    ["Meja belajar (20 unit)", 16000000, "2024-12-16"], ["Kursi belajar (20 unit)", 9800000, "2024-12-19"],
    ["Printer dan perangkat cetak", 5300000, "2024-12-21"],
  ];
  s.Aset = openingAssets.map(([name, cost, acquired], i) => ({
    aset_id: "sim-asset-opening-" + i, nama_aset: name, sumber: "SALDO_AWAL", transaksi_id: "", tanggal_perolehan: acquired,
    tanggal_mulai: acquired.slice(0, 7) + "-01", tanggal_saldo_awal: "2025-01-01", harga_perolehan: cost,
    umur_bulan: 48, nilai_residu: 0, akumulasi_awal: Math.round(cost * (monthIndex("2025-01-01") - monthIndex(acquired)) / 48),
    catatan: "Saldo awal simulasi. Akumulasi dihitung sejak bulan perolehan.", ...stamp("2025-01-01"),
  }));
  for (const [name, amount, date] of [["Peralatan olahraga tambahan", 1500000, "2025-06-12"], ["Perlengkapan latihan inventaris", 3000000, "2025-10-10"]] as [string, number, string][]) {
    const tx = expense(date, amount, "aset", "Pembelian " + name.toLowerCase());
    s.Aset.push({ aset_id: "sim-asset-" + tx, nama_aset: name, sumber: "TRANSAKSI", transaksi_id: tx, tanggal_perolehan: date, tanggal_mulai: date.slice(0, 7) + "-01", tanggal_saldo_awal: "",
      harga_perolehan: amount, umur_bulan: 48, nilai_residu: 0, akumulasi_awal: 0, catatan: "Pembelian tertaut, tanpa kas keluar kedua.", ...stamp(date) });
  }
  // Explicit opening equity, based on this synthetic opening schedule, not a balancing plug.
  const opening: [ReportAccount, number, number][] = [
    ["KAS_BANK", 19820000, 0], ["ASET_TETAP", 39450000, 0], ["AKUM_PENYUSUTAN", 0, 2426042],
    ["UTANG_PAJAK", 0, 880000], ["MODAL", 0, 40000000], ["LABA_DITAHAN", 0, 15963958],
  ];
  s.Saldo_Neraca = opening.map(([account, debit, credit], i) => ({ saldo_id: "sim-opening-" + i, versi: 1, tanggal: "2025-01-01", akun_laporan: account, debit, kredit: credit, sumber: "Jadwal pembukaan simulasi 2025, bukan saldo usaha nyata.", ...stamp("2025-01-01") }));
  s.Transaksi.sort((a, b) => String(a.tanggal_transaksi).localeCompare(String(b.tanggal_transaksi)));
  return s;
}
