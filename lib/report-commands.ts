import { DomainError, num, text, validDate, type Actor, type Command, type Row, type State } from "./domain.ts";
import { CREDIT_ACCOUNTS, JOURNAL_ACCOUNTS, MAPPING_ACCOUNTS, OPENING_ACCOUNTS, REPORT_ACCOUNTS, monthIndex, openingDerived, reportSetting, reportingAnchor, type ReportAccount } from "./reporting.ts";

function value(input: unknown, signed = false) {
  if (input === "" || input === undefined || input === null || typeof input === "boolean")
    throw new DomainError("Nominal laporan wajib berupa rupiah bulat.");
  const result = Number(input);
  if (!Number.isSafeInteger(result) || Math.abs(result) > 1000000000000 || (!signed && result < 0))
    throw new DomainError("Nominal laporan harus berupa rupiah bulat yang valid.");
  return result;
}
function required(input: unknown, label: string, max = 500) {
  const result = String(input ?? "").trim();
  if (!result || result.length > max) throw new DomainError(label + " wajib diisi (maksimal " + max + " karakter).");
  return result;
}
function openSince(s: State, from: string, until = "9999-12-31") {
  const closed = JSON.parse(reportSetting(s, "closed_periods", "[]")) as string[];
  if (closed.some(m => m >= from.slice(0, 7) && m <= until.slice(0, 7)))
    throw new DomainError("Perubahan memengaruhi periode yang ditutup. Buka kembali periode terkait dengan alasan terlebih dahulu.", "PERIOD_CLOSED", 409);
}
function dateFor(s: State, input: unknown) {
  const date = validDate(input);
  if (date < reportingAnchor(s)) throw new DomainError("Tanggal mendahului awal pembukuan laporan.");
  openSince(s, date, date);
  return date;
}
function firstOfMonth(input: unknown) {
  const date = validDate(input);
  if (!date.endsWith("-01")) throw new DomainError("Tanggal berlaku harus tanggal 1 pada suatu bulan.");
  return date;
}
function assertAsset(s: State, a: Row) {
  required(a.nama_aset, "Nama aset", 150);
  const acquired = validDate(a.tanggal_perolehan), start = firstOfMonth(a.tanggal_mulai);
  if (start.slice(0, 7) < acquired.slice(0, 7)) throw new DomainError("Penyusutan tidak boleh dimulai sebelum bulan perolehan.");
  const cost = value(a.harga_perolehan), residual = value(a.nilai_residu), acc = value(a.akumulasi_awal);
  const life = Number(a.umur_bulan);
  if (!cost || residual > cost || acc > cost - residual || !Number.isInteger(life) || life < 1 || life > 600)
    throw new DomainError("Harga, residu, akumulasi, atau umur manfaat aset tidak valid (1–600 bulan).");
  if (a.sumber === "TRANSAKSI") {
    const tx = s.Transaksi.find(tx => tx.transaksi_id === a.transaksi_id);
    if (!tx || tx.jenis !== "BIAYA" || num(tx, "nominal") !== cost || tx.tanggal_transaksi !== acquired)
      throw new DomainError("Aset harus ditautkan ke satu transaksi biaya dengan harga dan tanggal yang sama. Pisahkan transaksi untuk beberapa pembelian.");
    if (acc !== 0) throw new DomainError("Aset dari transaksi baru tidak mempunyai akumulasi awal.");
    if (s.Aset.some(other => other.aset_id !== a.aset_id && other.transaksi_id === a.transaksi_id))
      throw new DomainError("Transaksi ini sudah ditautkan ke aset lain.");
  } else if (a.sumber === "SALDO_AWAL") {
    const anchor = firstOfMonth(a.tanggal_saldo_awal);
    if (anchor !== reportingAnchor(s) || acquired > anchor) throw new DomainError("Aset awal harus dimiliki pada tanggal awal pembukuan.");
    if (monthIndex(anchor) - monthIndex(start) >= life && acc !== cost - residual)
      throw new DomainError("Umur manfaat aset awal sudah habis. Periksa akumulasi awal atau tanggal mulai penyusutan.");
    if (a.transaksi_id) throw new DomainError("Aset awal tidak membuat atau menautkan transaksi kas baru.");
  } else throw new DomainError("Pilih sumber aset yang valid.");
}
export function validateReportState(s: State) {
  for (const mapping of s.Pemetaan_Laporan) {
    if (!s.Kategori.some(c => c.kategori_id === mapping.kategori_id) || !MAPPING_ACCOUNTS.includes(text(mapping, "kelompok") as ReportAccount))
      throw new DomainError("Pemetaan kategori laporan tidak valid.", "DATA_INTEGRITY", 409);
    firstOfMonth(mapping.berlaku_mulai);
  }
  for (const asset of s.Aset) assertAsset(s, asset);
  const openingGroups = new Map<string, Row[]>();
  for (const row of s.Saldo_Neraca) {
    firstOfMonth(row.tanggal);
    if (![...OPENING_ACCOUNTS, "KAS_BANK", "ASET_TETAP", "AKUM_PENYUSUTAN"].includes(text(row, "akun_laporan")) || !Number.isInteger(row.versi) || num(row, "versi") < 1)
      throw new DomainError("Saldo awal neraca tidak valid.");
    value(row.debit); value(row.kredit);
    const key = text(row, "tanggal") + ":" + row.versi;
    openingGroups.set(key, [...(openingGroups.get(key) || []), row]);
  }
  for (const rows of openingGroups.values()) if (rows.reduce((a, r) => a + num(r, "debit") - num(r, "kredit"), 0) !== 0 || new Set(rows.map(r => r.akun_laporan)).size !== rows.length)
    throw new DomainError("Pembukaan neraca harus seimbang dan setiap akun hanya satu kali.");
  const groups = new Map<string, Row[]>();
  for (const row of s.Jurnal_Laporan) {
    validDate(row.tanggal);
    if (!JOURNAL_ACCOUNTS.includes(text(row, "akun_laporan") as ReportAccount)) throw new DomainError("Akun jurnal nonkas tidak diizinkan.");
    const debit = value(row.debit), credit = value(row.kredit);
    if ((debit > 0) === (credit > 0)) throw new DomainError("Setiap baris jurnal mempunyai satu sisi debit atau kredit.");
    required(row.jurnal_id, "ID jurnal"); required(row.deskripsi, "Keterangan jurnal");
    groups.set(text(row, "jurnal_id"), [...(groups.get(text(row, "jurnal_id")) || []), row]);
  }
  const reversed = new Set<string>();
  for (const rows of groups.values()) {
    if (rows.length < 2 || rows.reduce((a, r) => a + num(r, "debit") - num(r, "kredit"), 0) !== 0 || rows.some(r => r.tanggal !== rows[0].tanggal || r.operation_id !== rows[0].operation_id || text(r, "jurnal_rujukan_id") !== text(rows[0], "jurnal_rujukan_id")))
      throw new DomainError("Jurnal nonkas harus seimbang dengan tanggal dan operasi yang sama.");
    const reference = text(rows[0], "jurnal_rujukan_id");
    if (reference) {
      const source = groups.get(reference);
      const signature = (r: Row, flip = false) => [r.akun_laporan, num(r, flip ? "kredit" : "debit"), num(r, flip ? "debit" : "kredit")].join(":");
      if (!source || source[0].jurnal_rujukan_id || reversed.has(reference) || text(rows[0], "tanggal") < text(source[0], "tanggal") || rows.map(r => signature(r)).sort().join("|") !== source.map(r => signature(r, true)).sort().join("|"))
        throw new DomainError("Pembalik jurnal tidak sesuai sumber atau berulang.");
      reversed.add(reference);
    }
  }
  for (const rate of s.Tarif_Pajak) {
    firstOfMonth(rate.berlaku_mulai);
    const bp = value(rate.tarif_basis_poin);
    if (bp > 10000) throw new DomainError("Tarif pajak berada di luar rentang 0–100%.");
  }
  const linked = new Set<string>();
  for (const payment of s.Pembayaran_Pajak) {
    const tx = s.Transaksi.find(tx => tx.transaksi_id === payment.transaksi_id);
    if (!tx || tx.jenis !== "BIAYA" || linked.has(text(payment, "transaksi_id")) || s.Aset.some(a => a.transaksi_id === tx.transaksi_id) || !/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(text(payment, "periode_pajak")) || !["BEBAN", "PELUNASAN_UTANG"].includes(text(payment, "perlakuan")))
      throw new DomainError("Tautan pembayaran pajak tidak valid atau ganda.");
    linked.add(text(payment, "transaksi_id"));
  }
  const start = reportSetting(s, "reporting_start");
  if (start) firstOfMonth(start);
  const basis = reportSetting(s, "reporting_basis");
  if (basis && basis !== "KAS_DISESUAIKAN") throw new DomainError("Dasar laporan belum didukung.");
  const taxBasis = reportSetting(s, "tax_basis");
  if (taxBasis && !["KAS_BRUTO", "PENDAPATAN_BERSIH"].includes(taxBasis)) throw new DomainError("Dasar omzet pajak tidak valid.");
}
export function applyReportCommand(s: State, command: Command, actor: Actor, now: string, id: (prefix: string) => string): Row {
  if (actor.role !== "OWNER") throw new DomainError("Pengaturan dan penyesuaian laporan hanya untuk pemilik.", "FORBIDDEN", 403);
  const d = command.data, stamp = { created_at: now, created_by: actor.id, updated_at: now, updated_by: actor.id, operation_id: command.operationId };
  const put = (key: string, value: string) => {
    const row = s.Pengaturan.find(r => r.key === key);
    if (row) Object.assign(row, { value, updated_at: now, updated_by: actor.id });
    else s.Pengaturan.push({ key, value, updated_at: now, updated_by: actor.id });
  };
  if (command.action === "report.profile") {
    const date = firstOfMonth(d.tanggal_mulai), basis = String(d.basis || ""), taxBasis = String(d.dasar_pajak || "");
    if (basis !== "KAS_DISESUAIKAN" || d.confirmed !== true) throw new DomainError("Konfirmasi aturan kas dengan penyesuaian nonkas sebelum menyimpan dasar laporan.");
    if (taxBasis && !["KAS_BRUTO", "PENDAPATAN_BERSIH"].includes(taxBasis)) throw new DomainError("Pilih dasar omzet pajak yang valid.");
    if (date !== reportingAnchor(s) && (s.Aset.length || s.Saldo_Neraca.length || s.Jurnal_Laporan.length)) throw new DomainError("Tanggal awal dikunci setelah aset, saldo awal, atau jurnal dicatat.");
    if (date !== reportSetting(s, "reporting_start") || basis !== reportSetting(s, "reporting_basis") || taxBasis !== reportSetting(s, "tax_basis")) openSince(s, date < reportingAnchor(s) ? date : reportingAnchor(s));
    put("reporting_start", date); put("reporting_basis", basis); put("tax_basis", taxBasis);
    for (const key of ["report_location", "report_signer", "report_position"]) put(key, String(d[key] || "").trim().slice(0, 150));
    return { basis, date };
  }
  if (command.action === "report.mapping") {
    const date = firstOfMonth(d.berlaku_mulai); openSince(s, date);
    if (!Array.isArray(d.mappings) || !d.mappings.length || d.mappings.length > 200) throw new DomainError("Isi pemetaan kategori.");
    const seen = new Set<string>();
    for (const input of d.mappings) {
      const category = s.Kategori.find(c => c.kategori_id === input.kategori_id), group = String(input.kelompok);
      if (!category || seen.has(String(input.kategori_id)) || !MAPPING_ACCOUNTS.includes(group as ReportAccount)) throw new DomainError("Kategori atau kelompok laporan tidak valid/ganda.");
      const incoming = text(category, "jenis_yang_diizinkan").split(",").includes("PENERIMAAN_LAIN");
      if ((incoming && !["PENDAPATAN", "PENDAPATAN_LAIN"].includes(group)) || (!incoming && ["PENDAPATAN", "PENDAPATAN_LAIN"].includes(group))) throw new DomainError("Kelompok laporan harus sesuai kategori penerimaan atau biaya.");
      seen.add(String(input.kategori_id));
      s.Pemetaan_Laporan.push({ pemetaan_id: id("MAP"), kategori_id: String(input.kategori_id), kelompok: group, berlaku_mulai: date, ...stamp });
    }
    return { mapped: seen.size };
  }
  if (command.action === "report.asset") {
    const existing = d.id ? s.Aset.find(a => a.aset_id === d.id) : undefined;
    if (d.id && !existing) throw new DomainError("Aset tidak ditemukan.");
    const source = String(d.sumber), acquired = validDate(d.tanggal_perolehan);
    const anchor = reportingAnchor(s);
    openSince(s, source === "SALDO_AWAL" || existing?.sumber === "SALDO_AWAL" ? anchor : [acquired, text(existing, "tanggal_perolehan") || acquired].sort()[0]);
    const row: Row = { aset_id: existing?.aset_id || id("AST"), nama_aset: required(d.nama_aset, "Nama aset", 150), sumber: source, transaksi_id: source === "TRANSAKSI" ? String(d.transaksi_id || "") : "",
      tanggal_perolehan: acquired, tanggal_mulai: firstOfMonth(d.tanggal_mulai), tanggal_saldo_awal: source === "SALDO_AWAL" ? anchor : "",
      harga_perolehan: value(d.harga_perolehan), umur_bulan: value(d.umur_bulan), nilai_residu: value(d.nilai_residu ?? 0),
      akumulasi_awal: value(d.akumulasi_awal ?? 0), catatan: String(d.catatan || "").slice(0, 500), ...stamp };
    if (source === "TRANSAKSI" && (acquired < anchor || s.Transaksi.some(r => r.jenis === "PEMBALIK" && r.transaksi_rujukan_id === row.transaksi_id))) throw new DomainError("Pilih pembelian aktif sejak awal pembukuan. Aset dari periode sebelumnya memakai saldo awal.");
    assertAsset(s, row);
    if (s.Pembayaran_Pajak.some(p => p.transaksi_id === row.transaksi_id)) throw new DomainError("Transaksi sudah ditautkan sebagai pembayaran pajak.");
    if (existing) Object.assign(existing, row, { created_at: existing.created_at || now, created_by: existing.created_by || actor.id });
    else s.Aset.push(row);
    return { id: row.aset_id };
  }
  if (command.action === "report.opening") {
    const date = reportingAnchor(s); openSince(s, date);
    if (reportSetting(s, "reporting_basis") !== "KAS_DISESUAIKAN") throw new DomainError("Tetapkan dasar laporan sebelum memverifikasi saldo awal.");
    if (d.verified !== true) throw new DomainError("Verifikasi sumber saldo awal neraca.");
    const source = required(d.sumber, "Sumber/verifikasi saldo awal");
    const inputs = d.balances as Record<string, unknown>;
    if (!inputs || typeof inputs !== "object" || Object.keys(inputs).some(k => !OPENING_ACCOUNTS.includes(k as ReportAccount))) throw new DomainError("Rincian saldo awal tidak valid.");
    const balances: Partial<Record<ReportAccount, number>> = { ...openingDerived(s, date) };
    for (const key of OPENING_ACCOUNTS) balances[key] = value(inputs[key] ?? 0, true) * (CREDIT_ACCOUNTS.includes(key) ? -1 : 1);
    const difference = Object.values(balances).reduce((a, b) => a + b, 0);
    if (difference !== 0) throw new DomainError("Saldo awal belum seimbang. Selisih " + difference.toLocaleString("id-ID") + " rupiah; periksa sumber modal, utang, dan aset.");
    const version = Math.max(0, ...s.Saldo_Neraca.map(r => num(r, "versi"))) + 1;
    for (const [key, balance] of Object.entries(balances)) s.Saldo_Neraca.push({ saldo_id: id("OPEN"), versi: version, tanggal: date, akun_laporan: key, debit: Math.max(0, balance), kredit: Math.max(0, -balance), sumber: source, ...stamp });
    return { version, date };
  }
  if (command.action === "report.journal" || command.action === "report.journal.reverse") {
    const date = dateFor(s, d.tanggal), description = required(d.deskripsi, "Keterangan/alasan jurnal"), journalId = id("JRN");
    let lines: { akun_laporan: string; debit: number; kredit: number }[];
    let reference = "";
    if (command.action === "report.journal.reverse") {
      reference = required(d.jurnal_id, "Jurnal asal");
      const original = s.Jurnal_Laporan.filter(r => r.jurnal_id === reference);
      if (!original.length || original.some(r => r.jurnal_rujukan_id) || s.Jurnal_Laporan.some(r => r.jurnal_rujukan_id === reference) || date < text(original[0], "tanggal")) throw new DomainError("Jurnal tidak dapat dibalik: periksa tanggal atau riwayat pembalik.");
      lines = original.map(r => ({ akun_laporan: text(r, "akun_laporan"), debit: num(r, "kredit"), kredit: num(r, "debit") }));
    } else {
      if (!Array.isArray(d.lines) || d.lines.length < 2 || d.lines.length > 20) throw new DomainError("Jurnal memerlukan 2–20 baris.");
      lines = d.lines.map(r => ({ akun_laporan: String(r.akun_laporan), debit: value(r.debit ?? 0), kredit: value(r.kredit ?? 0) }));
    }
    if (lines.reduce((a, r) => a + r.debit - r.kredit, 0) !== 0) throw new DomainError("Jumlah debit dan kredit jurnal harus sama.");
    for (const line of lines) {
      if (!JOURNAL_ACCOUNTS.includes(line.akun_laporan as ReportAccount) || (line.debit > 0) === (line.kredit > 0)) throw new DomainError("Isi akun dan satu sisi debit/kredit tiap baris. Kas dan aset dikelola melalui transaksi/daftar aset.");
      s.Jurnal_Laporan.push({ baris_id: id("JL"), jurnal_id: journalId, tanggal: date, ...line, deskripsi: description, rujukan: String(d.rujukan || "").slice(0, 200), jurnal_rujukan_id: reference, ...stamp });
    }
    return { id: journalId };
  }
  if (command.action === "report.tax.rate") {
    const date = firstOfMonth(d.berlaku_mulai); openSince(s, date);
    const rate = value(d.tarif_basis_poin);
    if (rate > 10000) throw new DomainError("Tarif pajak maksimum 100%.");
    const row: Row = { tarif_id: id("TAX"), berlaku_mulai: date, tarif_basis_poin: rate, catatan: required(d.catatan, "Dasar/catatan tarif"), ...stamp };
    s.Tarif_Pajak.push(row);
    return { id: row.tarif_id };
  }
  if (command.action === "report.tax.payment") {
    const tx = s.Transaksi.find(tx => tx.transaksi_id === d.transaksi_id);
    if (!tx || tx.jenis !== "BIAYA" || s.Transaksi.some(r => r.jenis === "PEMBALIK" && r.transaksi_rujukan_id === tx.transaksi_id)) throw new DomainError("Pilih transaksi biaya aktif untuk pembayaran pajak.");
    openSince(s, text(tx, "tanggal_transaksi"));
    const period = required(d.periode_pajak, "Periode pajak");
    if (!/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(period)) throw new DomainError("Periode pajak memakai YYYY atau YYYY-MM.");
    const existing = s.Pembayaran_Pajak.find(p => p.transaksi_id === tx.transaksi_id);
    const row: Row = { pembayaran_id: existing?.pembayaran_id || id("TAXPAY"), transaksi_id: text(tx, "transaksi_id"), periode_pajak: period, perlakuan: String(d.perlakuan), catatan: required(d.catatan, "Catatan pembayaran pajak"), ...stamp };
    if (existing) Object.assign(existing, row, { created_at: existing.created_at || now, created_by: existing.created_by || actor.id });
    else s.Pembayaran_Pajak.push(row);
    return { id: row.pembayaran_id };
  }
  throw new DomainError("Tindakan laporan tidak dikenali.");
}
