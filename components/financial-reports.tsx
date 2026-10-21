"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Icon from "./icon";
import { dateLabel, endOfMonth, money, num, setting, text, today, type Actor, type Row, type State } from "../lib/domain";
import { CREDIT_ACCOUNTS, EXPENSE_ACCOUNTS, JOURNAL_ACCOUNTS, MAPPING_ACCOUNTS, OPENING_ACCOUNTS, REPORT_ACCOUNTS, assetPeriodExpense, cashbook, financialStatements, mappingAt, openingDerived, openingRows, reportCSV, reportSetting, reportingAnchor, taxReport, type ReportAccount } from "../lib/reporting";
import { buildReportDocument, validReportRange } from "../lib/report-document";

type Kind = "cash" | "profit" | "balance" | "assets" | "tax" | "checks" | "overview";
type Manage = "profile" | "mapping" | "opening" | "asset" | "journal" | "tax" | "payment";
const kinds: [Kind, string][] = [["cash", "Buku kas"], ["profit", "Laba rugi"], ["balance", "Neraca"], ["assets", "Aset & penyusutan"], ["tax", "Omzet & pajak"], ["checks", "Pemeriksaan"], ["overview", "Ringkasan kas"]];
const management: [Manage, string][] = [["profile", "Dasar laporan"], ["mapping", "Kategori"], ["opening", "Saldo awal"], ["asset", "Aset"], ["journal", "Jurnal nonkas"], ["tax", "Tarif pajak"], ["payment", "Pembayaran pajak"]];
type Props = { data: State; actor: Actor; month: string; canWrite: boolean; busy: boolean; simulation: boolean; dataAsOf: string; execute: (action: string, payload: Record<string, unknown>) => Promise<boolean>; children: ReactNode };
function Field({ label, children, wide = false, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return <label className={"field" + (wide ? " full" : "")}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Amount({ name, value = 0, signed = false, label }: { name?: string; value?: number; signed?: boolean; label?: string }) {
  return <input aria-label={label} name={name} type="number" step="1" min={signed ? -1000000000000 : 0} max="1000000000000" defaultValue={value} required inputMode="numeric" />;
}
function exportFile(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function FinancialReports({ data, actor, month, canWrite, busy, simulation, dataAsOf, execute, children }: Props) {
  const [kind, setKind] = useState<Kind>("cash");
  const [period, setPeriod] = useState("month"), [selectedMonth, setSelectedMonth] = useState(month), [year, setYear] = useState(month.slice(0, 4));
  const [customFrom, setCustomFrom] = useState(month + "-01"), [customTo, setCustomTo] = useState(endOfMonth(month));
  const [accountId, setAccountId] = useState(""), [manager, setManager] = useState<Manage | null>(null), [notice, setNotice] = useState("");
  const [formError, setFormError] = useState(""), [saving, setSaving] = useState(false), [editingAsset, setEditingAsset] = useState<Row | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false), [pdfError, setPdfError] = useState("");
  const [assetSource, setAssetSource] = useState("TRANSAKSI"), [assetTransaction, setAssetTransaction] = useState("");
  const [openingInput, setOpeningInput] = useState<Record<string, string>>({});
  const [journalLines, setJournalLines] = useState([{ account: "PIUTANG", debit: "", credit: "" }, { account: "PENDAPATAN", debit: "", credit: "" }]);
  const [detailAccount, setDetailAccount] = useState<ReportAccount | null>(null);
  const submitting = useRef(false), manageRef = useRef<HTMLDivElement>(null);
  const printCleanup = useRef<(() => void) | null>(null);
  const pdfInFlight = useRef(false);
  useEffect(() => { setSelectedMonth(month); setYear(month.slice(0, 4)); }, [month]);
  useEffect(() => { setNotice(""); setPdfError(""); }, [kind, period, selectedMonth, year, customFrom, customTo, accountId]);
  useEffect(() => () => { printCleanup.current?.(); }, []);
  const from = period === "year" ? year + "-01-01" : period === "custom" ? customFrom : selectedMonth + "-01";
  const to = period === "year" ? year + "-12-31" : period === "custom" ? customTo : endOfMonth(selectedMonth);
  const validRange = validReportRange(from, to);
  const safeFrom = validRange ? from : selectedMonth + "-01", safeTo = validRange ? to : endOfMonth(selectedMonth);
  const report = useMemo(() => financialStatements(data, safeFrom, safeTo), [data, safeFrom, safeTo]);
  const book = useMemo(() => cashbook(data, safeFrom, safeTo, accountId), [data, safeFrom, safeTo, accountId]);
  const tax = useMemo(() => taxReport(data, safeFrom, safeTo), [data, safeFrom, safeTo]);
  const business = setting(data, "business_name", "Garda Abdi Negara"), owner = actor.role === "OWNER";
  const calculationReady = kind === "cash" ? !book.warnings.length && book.difference === 0 : kind === "tax" ? tax.ready && report.ready : report.ready;
  const futurePeriod = safeTo > today(setting(data, "timezone", "Asia/Jakarta"));
  const ready = calculationReady && !futurePeriod;
  const statusText = ready ? "Siap diperiksa" : futurePeriod && calculationReady ? "Proyeksi" : "Draf";
  const reportWarnings = [...(kind === "cash" ? book.warnings : [...report.warnings, ...(kind === "tax" ? tax.warnings : [])]), ...(futurePeriod ? ["Periode belum berakhir. Angka akhir periode dan penyusutan setelah hari ini merupakan proyeksi berdasarkan data saat ini."] : [])];
  const title = kinds.find(k => k[0] === kind)![1];
  const assetYear = safeTo.slice(0, 4), anchor = reportingAnchor(data);
  const disabled = !owner || !canWrite || busy || saving;
  const transaction = data.Transaksi.find(tx => tx.transaksi_id === assetTransaction);
  const initialDerived = openingDerived(data);
  const openingTotal = Object.values(initialDerived).reduce((a, b) => a + b, 0) + OPENING_ACCOUNTS.reduce((a, k) => a + Number(openingInput[k] || 0) * (CREDIT_ACCOUNTS.includes(k) ? -1 : 1), 0);
  const journalDebit = journalLines.reduce((a, l) => a + Number(l.debit || 0), 0), journalCredit = journalLines.reduce((a, l) => a + Number(l.credit || 0), 0);
  function beginManage(next: Manage, asset: Row | null = null) {
    setManager(next); setFormError(""); setNotice(""); setEditingAsset(asset);
    setAssetSource(text(asset || undefined, "sumber") || "TRANSAKSI"); setAssetTransaction(text(asset || undefined, "transaksi_id"));
    const opening = openingRows(data);
    setOpeningInput(Object.fromEntries(OPENING_ACCOUNTS.map(k => {
      const row = opening.find(r => r.akun_laporan === k);
      return [k, String((num(row, "debit") - num(row, "kredit")) * (CREDIT_ACCOUNTS.includes(k) ? -1 : 1))];
    })));
    setTimeout(() => manageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
  }
  async function submit(event: FormEvent<HTMLFormElement>, action: string, transform?: (values: Record<string, unknown>) => Record<string, unknown>) {
    event.preventDefault();
    if (submitting.current || disabled) return;
    submitting.current = true; setSaving(true); setFormError(""); setNotice("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await execute(action, transform ? transform(values) : values);
      if (result) { setManager(null); setNotice(simulation ? "Perubahan laporan tersimpan pada data contoh." : "Perubahan laporan tersimpan."); setEditingAsset(null); }
      else setFormError("Data belum tersimpan. Periksa pesan penyimpanan di atas halaman.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Isian belum dapat disimpan."); }
    finally { submitting.current = false; setSaving(false); }
  }
  function exportReport() {
    const meta: (string | number | null)[][] = [[business, title], ["Periode", safeFrom, safeTo], ["Sumber", simulation ? "DATA CONTOH" : "Google Sheets"], ["Status", statusText], ["Dasar laporan", reportSetting(data, "reporting_basis") === "KAS_DISESUAIKAN" ? "Kas dengan penyesuaian nonkas" : "Belum ditetapkan"]];
    let rows: (string | number | null)[][] = [];
    if (kind === "cash") rows = [["Tanggal", "Keterangan", "Akun", "Pemasukan", "Pengeluaran", "Saldo", "Referensi"], [safeFrom, "Saldo awal", accountId || "Seluruh akun", 0, 0, book.opening, ""], ...book.lines.map(l => [l.date, l.description + (l.internal ? " · transfer internal neto nol" : ""), l.account, l.incoming, l.outgoing, l.balance, l.reference]), [safeTo, "Saldo akhir", "", book.incoming, book.outgoing, book.closing, ""]];
    if (kind === "profit") rows = [["Kelompok", "Nominal"], ["Pendapatan jasa", report.income], ["Biaya jasa", report.directCosts], ["Laba kotor", report.grossProfit], ...EXPENSE_ACCOUNTS.filter(k => k !== "BIAYA_JASA" && k !== "BEBAN_LAIN").map(k => [REPORT_ACCOUNTS[k], report.period[k]]), ["Pendapatan lain", -report.period.PENDAPATAN_LAIN], ["Beban lain", report.period.BEBAN_LAIN], ["Laba/rugi bersih", report.netProfit]];
    if (kind === "balance") rows = [["Akun", "Saldo"], ...(["KAS_BANK", "PIUTANG", "PERSEDIAAN", "SEWA_DIMUKA", "ASET_TETAP", "AKUM_PENYUSUTAN", "UTANG_USAHA", "UTANG_PAJAK", "PINJAMAN", "UANG_MUKA", "MODAL"] as ReportAccount[]).map(k => [REPORT_ACCOUNTS[k], report.balances[k] * (CREDIT_ACCOUNTS.includes(k) && k !== "AKUM_PENYUSUTAN" ? -1 : 1)]), ["Laba ditahan", report.retained], ["Laba berjalan tahun ini", report.currentProfit], ["Prive", -report.balances.PRIVE], ["Total aset", report.assetTotal], ["Total kewajiban dan ekuitas", report.liabilities + report.equity]];
    if (kind === "assets") rows = [["Aset", "Tanggal perolehan", "Mulai penyusutan", "Umur (bulan)", "Harga", "Residu", ...Array.from({ length: 12 }, (_, i) => assetYear + "-" + String(i + 1).padStart(2, "0")), "Beban periode", "Akumulasi", "Nilai buku"], ...report.assets.map(a => [text(a.asset, "nama_aset"), text(a.asset, "tanggal_perolehan"), text(a.asset, "tanggal_mulai"), num(a.asset, "umur_bulan"), a.cost, num(a.asset, "nilai_residu"), ...Array.from({ length: 12 }, (_, i) => { const m = assetYear + "-" + String(i + 1).padStart(2, "0"); return assetPeriodExpense(data, a.asset, m + "-01", endOfMonth(m)); }), a.expense, a.accumulated, a.book])];
    if (kind === "tax") rows = [["Dasar omzet", tax.basis], ["Bulan", "Omzet", "Tarif (%)", "Perhitungan pajak", "Dibayar untuk periode tersebut"], ...tax.rows.map(r => [r.month, r.turnover, r.basisPoints === null ? null : r.basisPoints / 100, r.tax, r.paid]), ["Total", tax.turnover, "", tax.total, tax.rows.reduce((a, r) => a + r.paid, 0)], [], ["Tanggal bayar", "Periode pajak", "Nominal", "Perlakuan", "Keterangan"], ...tax.payments.map(p => [p.date, text(p, "periode_pajak"), p.amount, text(p, "perlakuan"), p.description])];
    if (kind === "checks") rows = [["Pemeriksaan", "Selisih", "Keterangan"], ...report.checks.map(c => [c.label, c.difference, c.detail]), ...report.warnings.map(w => ["Perlu diperiksa", "", actor.role === "VIEWER" ? "Kelengkapan data perlu diperiksa." : w])];
    if (kind === "overview") return;
    if (kind === "profit" && report.period.BELUM_DIPETAKAN) rows.push(["Mutasi usaha belum dipetakan (sementara)", report.period.BELUM_DIPETAKAN]);
    if (actor.role === "VIEWER" && kind === "cash") rows = [["Ringkasan buku kas", "Nominal"], ["Saldo awal", book.opening], ["Pemasukan", book.incoming], ["Pengeluaran", book.outgoing], ["Tambahan saldo pembukaan akun", book.additionalOpening], ["Saldo akhir", book.closing]];
    if (actor.role === "VIEWER" && kind === "tax") rows = [["Bulan", "Omzet", "Tarif (%)", "Perhitungan pajak", "Dibayar untuk periode"], ...tax.rows.map(r => [r.month, r.turnover, r.basisPoints === null ? null : r.basisPoints / 100, r.tax, r.paid])];
    rows.push([], ...reportWarnings.map(w => ["Perlu diperiksa", actor.role === "VIEWER" ? "Periksa kelengkapan data dan tanggal akhir periode." : w]));
    if (actor.role !== "VIEWER" && ["profit", "balance", "checks"].includes(kind)) {
      rows.push([], ["Rincian sumber periode"], ["Tanggal", "Kelompok", "Nominal debit-kredit", "Keterangan", "Referensi"]);
      rows.push(...report.sources.filter(r => r.account !== "KAS_BANK").map(r => [r.date, REPORT_ACCOUNTS[r.account], r.value, r.description, r.reference]));
    }
    exportFile(reportCSV([...meta, [], ...rows]), "garda-" + kind + "-" + safeFrom + "-" + safeTo + ".csv");
    setNotice("CSV laporan dan rincian sumber berhasil diunduh.");
  }
  function printReport() {
    printCleanup.current?.();
    document.body.dataset.reportPrint = kind;
    document.body.dataset.print = "financial";
    const cleanup = () => {
      delete document.body.dataset.reportPrint; delete document.body.dataset.print;
      window.removeEventListener("afterprint", cleanup);
      printCleanup.current = null;
    };
    printCleanup.current = cleanup;
    window.addEventListener("afterprint", cleanup);
    try { window.print(); } catch { cleanup(); setNotice("Buka menu cetak browser untuk menyimpan laporan sebagai PDF."); }
  }
  async function generatePdf() {
    if (!validRange || kind === "overview" || pdfInFlight.current) return;
    pdfInFlight.current = true; setGeneratingPdf(true); setPdfError(""); setNotice("");
    try {
      // Capture the requested data and selection before loading the PDF renderer.
      const documentSnapshot = buildReportDocument(data, { kind, from, to, accountId, role: actor.role, simulation, dataAsOf });
      const { loadReportFonts, renderReportPdf } = await import("../lib/report-pdf");
      const bytes = renderReportPdf(documentSnapshot, await loadReportFonts());
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url; link.download = documentSnapshot.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice("PDF " + documentSnapshot.title + " siap diunduh: " + documentSnapshot.filename);
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "PDF belum dapat dibuat. Coba lagi.");
    } finally {
      pdfInFlight.current = false; setGeneratingPdf(false);
    }
  }
  function line(account: ReportAccount, amount = report.period[account], total = false) {
    return <button type="button" className={"statement-line" + (total ? " statement-total" : "")} key={account} onClick={() => setDetailAccount(account)} title="Lihat mutasi pembentuk angka"><span>{REPORT_ACCOUNTS[account]}</span><strong>{money(amount)}</strong></button>;
  }
  function totalLine(label: string, amount: number, hero = false) {
    return <div className={"statement-line statement-total" + (hero ? " statement-result" : "")}><span>{label}</span><strong>{money(amount)}</strong></div>;
  }
  const yearColumns = Array.from({ length: 12 }, (_, i) => assetYear + "-" + String(i + 1).padStart(2, "0"));
  const journalGroups = [...new Set(data.Jurnal_Laporan.map(r => text(r, "jurnal_id")))];
  return <div className="financial-reports">
    <div className="reports-intro no-report-print">
      <div><span className="reports-kicker">KEUANGAN YANG TERHUBUNG</span><h2>Satu catatan, semua laporan.</h2><p>Telusuri transaksi, lihat hasil usaha, dan siapkan laporan periodik.</p></div>
      {owner && <button className="btn primary" onClick={() => beginManage(manager ? manager : "profile")}><Icon name="settings" />Kelola laporan</button>}
    </div>
    <nav className="report-tabs no-report-print" aria-label="Jenis laporan">{kinds.map(([id, label]) => <button key={id} type="button" aria-pressed={kind === id} onClick={() => { setKind(id); setDetailAccount(null); }}>{label}</button>)}</nav>
    {kind !== "overview" && <div className="report-controls no-report-print">
      <Field label="Periode"><select aria-label="Jenis periode laporan" value={period} onChange={e => setPeriod(e.target.value)}><option value="month">Bulanan</option><option value="year">Tahunan</option><option value="custom">Rentang tanggal</option></select></Field>
      {period === "month" && <Field label="Bulan"><input aria-label="Bulan laporan" type="month" value={selectedMonth} onInput={e => e.currentTarget.value && setSelectedMonth(e.currentTarget.value)} onChange={e => e.target.value && setSelectedMonth(e.target.value)} /></Field>}
      {period === "year" && <Field label="Tahun"><input aria-label="Tahun laporan" type="number" min="1900" max="9998" value={year} onChange={e => setYear(e.target.value)} /></Field>}
      {period === "custom" && <><Field label="Dari"><input aria-label="Awal periode laporan" type="date" value={customFrom} onInput={e => setCustomFrom(e.currentTarget.value)} onChange={e => setCustomFrom(e.target.value)} /></Field><Field label="Sampai"><input aria-label="Akhir periode laporan" type="date" value={customTo} onInput={e => setCustomTo(e.currentTarget.value)} onChange={e => setCustomTo(e.target.value)} /></Field></>}
      {kind === "cash" && <Field label="Kas / rekening"><select aria-label="Akun buku kas" value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Semua kas & bank</option>{data.Akun.map(a => <option key={text(a, "akun_id")} value={text(a, "akun_id")}>{text(a, "nama_akun")}</option>)}</select></Field>}
      <div className="report-export">
        <button className="btn primary report-generate" disabled={!validRange || generatingPdf} aria-busy={generatingPdf} onClick={() => void generatePdf()}><Icon name="download" />{generatingPdf ? "Menyiapkan PDF…" : "Generate Laporan"}</button>
        <button className="btn" disabled={!validRange} onClick={exportReport}>CSV</button>
        <button className="btn" disabled={!validRange} onClick={printReport}><Icon name="print" />Cetak</button>
      </div>
    </div>}
    {kind !== "overview" && <p className="report-download-hint no-report-print">Generate Laporan mengunduh PDF sesuai jenis, periode, dan akun yang dipilih.</p>}
    {!validRange && <p role="alert" className="form-error">Pilih rentang tanggal yang valid, maksimum 10 tahun.</p>}
    {pdfError && <p role="alert" className="form-error no-report-print">{pdfError}</p>}
    {notice && <p role="status" className="report-notice no-report-print">{notice}</p>}
    {manager && owner && <div className="report-manager no-report-print panel" ref={manageRef}>
      <div className="report-manager-heading"><div><span className="reports-kicker">PENGATURAN LAPORAN</span><h2>Lengkapi dasar angkanya.</h2></div><button className="btn" onClick={() => { setManager(null); setFormError(""); }} disabled={saving}>Tutup</button></div>
      <nav className="manage-tabs" aria-label="Pengaturan laporan">{management.map(([id, label]) => <button type="button" key={id} aria-pressed={manager === id} onClick={() => beginManage(id)}>{label}</button>)}</nav>
      {!canWrite && <p className="form-error">Penulisan belum tersedia. Periksa koneksi, migrasi spreadsheet, atau operasi yang masih menunggu verifikasi.</p>}
      {formError && <p role="alert" className="form-error">{formError}</p>}
      {manager === "profile" && <form key="profile" onSubmit={e => void submit(e, "report.profile", v => ({ ...v, confirmed: v.confirmed === "on" }))}>
        <p className="form-hint">Pendapatan mengikuti uang diterima, lalu disesuaikan melalui jurnal nonkas. Piutang dan uang muka dicatat melalui saldo awal/jurnal; daftar tagihan tetap tersedia pada Ringkasan kas. Penyusutan dihitung setiap akhir bulan.</p>
        <div className="form-grid">
          <Field label="Awal pembukuan laporan"><input name="tanggal_mulai" type="date" defaultValue={anchor} required /></Field>
          <Field label="Dasar pengakuan"><select name="basis" defaultValue={reportSetting(data, "reporting_basis")} required><option value="">Pilih dasar laporan</option><option value="KAS_DISESUAIKAN">Kas dengan penyesuaian nonkas</option></select></Field>
          <Field label="Dasar omzet pajak"><select name="dasar_pajak" defaultValue={reportSetting(data, "tax_basis")}><option value="">Belum ditetapkan</option><option value="KAS_BRUTO">Penerimaan jasa bruto (kas)</option><option value="PENDAPATAN_BERSIH">Pendapatan jasa setelah penyesuaian</option></select></Field>
          <Field label="Lokasi penerbitan"><input name="report_location" defaultValue={reportSetting(data, "report_location")} maxLength={150} placeholder="Kab. Gowa" /></Field>
          <Field label="Nama penandatangan"><input name="report_signer" defaultValue={reportSetting(data, "report_signer")} maxLength={150} /></Field>
          <Field label="Jabatan"><input name="report_position" defaultValue={reportSetting(data, "report_position")} maxLength={150} placeholder="Direktur" /></Field>
        </div>
        <label className="report-checkbox"><input type="checkbox" name="confirmed" required />Saya menetapkan dasar ini dan akan mencatat penyesuaian piutang, uang muka, serta kewajiban sesuai sumbernya.</label>
        <button className="btn primary" disabled={disabled}>Simpan dasar laporan</button>
      </form>}
      {manager === "mapping" && <form key="mapping" onSubmit={e => void submit(e, "report.mapping", v => ({ berlaku_mulai: String(v.berlaku_mulai) + "-01", mappings: data.Kategori.filter(c => v["map-" + c.kategori_id]).map(c => ({ kategori_id: c.kategori_id, kelompok: v["map-" + c.kategori_id] })) }))}>
        <p className="form-hint">Pemetaan mempunyai tanggal berlaku. Periode yang ditutup dilindungi. Aset yang ditautkan ke pembelian dan pembayaran pajak memakai pencatatannya sendiri.</p>
        <Field label="Berlaku mulai bulan"><input name="berlaku_mulai" type="month" defaultValue={anchor.slice(0, 7)} required /></Field>
        <div className="mapping-list">{data.Kategori.filter(c => /BIAYA|PENERIMAAN_LAIN/.test(text(c, "jenis_yang_diizinkan"))).map(c => <Field key={text(c, "kategori_id")} label={text(c, "nama_kategori")}><select name={"map-" + c.kategori_id} defaultValue={mappingAt(data, text(c, "kategori_id"), safeTo)}><option value="">Belum dipetakan</option>{MAPPING_ACCOUNTS.filter(k => text(c, "jenis_yang_diizinkan").includes("PENERIMAAN_LAIN") ? ["PENDAPATAN", "PENDAPATAN_LAIN"].includes(k) : !["PENDAPATAN", "PENDAPATAN_LAIN"].includes(k)).map(k => <option key={k} value={k}>{REPORT_ACCOUNTS[k]}</option>)}</select></Field>)}</div>
        <button className="btn primary" disabled={disabled}>Simpan versi pemetaan</button>
      </form>}
      {manager === "opening" && <form key="opening" onSubmit={e => void submit(e, "report.opening", v => ({ sumber: v.sumber, balances: openingInput, verified: v.verified === "on" }))}>
        <p className="form-hint">Posisi pembukaan {dateLabel(anchor)}. Kas serta aset mengikuti data akun dan daftar aset. Masukkan saldo lain berdasarkan bukti. Saldo negatif diperbolehkan, misalnya akumulasi rugi pada laba ditahan.</p>
        <div className="report-opening-derived">{Object.entries(initialDerived).map(([key, amount]) => <div key={key}><span>{REPORT_ACCOUNTS[key as ReportAccount]}</span><strong>{money(Math.abs(amount))}</strong></div>)}</div>
        <div className="form-grid">{OPENING_ACCOUNTS.map(k => <Field key={k} label={REPORT_ACCOUNTS[k]}><input name={k} type="number" step="1" min="-1000000000000" max="1000000000000" inputMode="numeric" value={openingInput[k] ?? "0"} onChange={e => setOpeningInput(old => ({ ...old, [k]: e.target.value }))} required /></Field>)}
          <Field label="Sumber / catatan verifikasi" wide><textarea name="sumber" defaultValue={text(openingRows(data)[0], "sumber")} required maxLength={500} placeholder="Referensi saldo bank, kas fisik, daftar aset, dan modal awal" /></Field>
        </div>
        <div className={"opening-difference " + (openingTotal === 0 ? "positive" : "negative")}>Selisih pembukaan <strong>{money(openingTotal)}</strong></div>
        <label className="report-checkbox"><input type="checkbox" name="verified" required />Saya telah memeriksa sumber saldo awal dan keseimbangan neraca.</label>
        <button className="btn primary" disabled={disabled || openingTotal !== 0}>Verifikasi & simpan saldo awal</button>
      </form>}
      {manager === "asset" && <form key={"asset-" + (editingAsset?.aset_id || "new")} onSubmit={e => void submit(e, "report.asset", v => ({ ...v, id: editingAsset?.aset_id, sumber: assetSource, transaksi_id: assetSource === "TRANSAKSI" ? assetTransaction : "", harga_perolehan: assetSource === "TRANSAKSI" ? num(transaction, "nominal") : v.harga_perolehan, tanggal_perolehan: assetSource === "TRANSAKSI" ? text(transaction, "tanggal_transaksi") : v.tanggal_perolehan, tanggal_mulai: String(v.bulan_mulai) + "-01", akumulasi_awal: assetSource === "TRANSAKSI" ? 0 : v.akumulasi_awal }))}>
        <p className="form-hint">Metode garis lurus dengan pembulatan kumulatif. Aset baru ditautkan ke biaya yang sudah tercatat, sehingga kas keluar tetap satu kali. Nilai awal aset lama dicatat tanpa kas baru.</p>
        <div className="form-grid">
          <Field label="Nama aset"><input name="nama_aset" defaultValue={text(editingAsset || undefined, "nama_aset")} required maxLength={150} /></Field>
          <Field label="Sumber aset"><select value={assetSource} onChange={e => setAssetSource(e.target.value)}><option value="TRANSAKSI">Dari transaksi pembelian</option><option value="SALDO_AWAL">Aset pada awal pembukuan</option></select></Field>
          {assetSource === "TRANSAKSI" ? <Field label="Transaksi pembelian" wide><select value={assetTransaction} onChange={e => setAssetTransaction(e.target.value)} required><option value="">Pilih transaksi biaya</option>{data.Transaksi.filter(tx => tx.jenis === "BIAYA" && !data.Transaksi.some(r => r.jenis === "PEMBALIK" && r.transaksi_rujukan_id === tx.transaksi_id) && !data.Pembayaran_Pajak.some(p => p.transaksi_id === tx.transaksi_id) && !data.Aset.some(a => a.transaksi_id === tx.transaksi_id && a.aset_id !== editingAsset?.aset_id)).map(tx => <option key={text(tx, "transaksi_id")} value={text(tx, "transaksi_id")}>{text(tx, "tanggal_transaksi")} · {text(tx, "deskripsi")} · {money(num(tx, "nominal"))}</option>)}</select>{transaction && <small>Harga {money(num(transaction, "nominal"))} · perolehan {dateLabel(text(transaction, "tanggal_transaksi"))}</small>}</Field> : <>
            <Field label="Tanggal perolehan"><input name="tanggal_perolehan" type="date" defaultValue={text(editingAsset || undefined, "tanggal_perolehan") || anchor} required /></Field>
            <Field label="Harga perolehan"><Amount name="harga_perolehan" value={num(editingAsset || undefined, "harga_perolehan")} /></Field>
            <Field label="Akumulasi sebelum awal pembukuan"><Amount name="akumulasi_awal" value={num(editingAsset || undefined, "akumulasi_awal")} /></Field>
          </>}
          <Field label="Mulai penyusutan (bulan)"><input name="bulan_mulai" type="month" defaultValue={text(editingAsset || undefined, "tanggal_mulai").slice(0, 7) || selectedMonth} required /></Field>
          <Field label="Umur manfaat (bulan)"><input name="umur_bulan" type="number" defaultValue={num(editingAsset || undefined, "umur_bulan") || 48} min={1} max={600} step={1} required /></Field>
          <Field label="Nilai residu"><Amount name="nilai_residu" value={num(editingAsset || undefined, "nilai_residu")} /></Field>
          <Field label="Catatan / sumber penilaian" wide><textarea name="catatan" defaultValue={text(editingAsset || undefined, "catatan")} maxLength={500} /></Field>
        </div>
        <button className="btn primary" disabled={disabled}>{editingAsset ? "Simpan perubahan aset" : "Catat aset"}</button>
      </form>}
      {manager === "journal" && <form key="journal" onSubmit={e => void submit(e, "report.journal", v => ({ ...v, lines: journalLines.map(l => ({ akun_laporan: l.account, debit: l.debit || 0, kredit: l.credit || 0 })) }))}>
        <p className="form-hint">Untuk piutang, uang muka, kewajiban, dan penyesuaian pendapatan/biaya. Jurnal ini tidak membuat kas masuk/keluar. Koreksi jurnal dilakukan dengan pembalik.</p>
        <div className="form-grid"><Field label="Tanggal efektif"><input name="tanggal" type="date" min={anchor} defaultValue={safeTo} required /></Field><Field label="Referensi bukti"><input name="rujukan" maxLength={200} /></Field><Field label="Keterangan / alasan" wide><textarea name="deskripsi" required maxLength={500} /></Field></div>
        <div className="journal-lines">{journalLines.map((l, index) => <div className="journal-line" key={index}><Field label={"Akun baris " + (index + 1)}><select value={l.account} onChange={e => setJournalLines(old => old.map((r, i) => i === index ? { ...r, account: e.target.value } : r))}>{JOURNAL_ACCOUNTS.map(k => <option value={k} key={k}>{REPORT_ACCOUNTS[k]}</option>)}</select></Field><Field label="Debit"><input type="number" aria-label={"Debit baris " + (index + 1)} min={0} step={1} value={l.debit} onChange={e => setJournalLines(old => old.map((r, i) => i === index ? { ...r, debit: e.target.value } : r))} /></Field><Field label="Kredit"><input type="number" aria-label={"Kredit baris " + (index + 1)} min={0} step={1} value={l.credit} onChange={e => setJournalLines(old => old.map((r, i) => i === index ? { ...r, credit: e.target.value } : r))} /></Field><button type="button" className="btn" aria-label={"Hapus baris " + (index + 1)} disabled={journalLines.length <= 2} onClick={() => setJournalLines(old => old.filter((_, i) => i !== index))}>×</button></div>)}</div>
        <div className="journal-summary"><button className="btn" type="button" disabled={journalLines.length >= 20} onClick={() => setJournalLines(old => [...old, { account: "BIAYA_LAIN", debit: "", credit: "" }])}>Tambah baris</button><span>Debit {money(journalDebit)} · Kredit {money(journalCredit)}</span></div>
        <button className="btn primary" disabled={disabled || journalDebit !== journalCredit || journalDebit === 0}>Simpan jurnal nonkas</button>
      </form>}
      {manager === "tax" && <form key="tax" onSubmit={e => void submit(e, "report.tax.rate", v => ({ ...v, berlaku_mulai: String(v.bulan_berlaku) + "-01", tarif_basis_poin: Math.round(Number(v.persen) * 100) }))}>
        <p className="form-hint">Tetapkan tarif dan periode berlaku berdasarkan kondisi usaha. Tarif contoh PDF tidak diterapkan otomatis. Versi tarif lama tetap tersimpan.</p>
        <div className="form-grid"><Field label="Berlaku mulai bulan"><input type="month" name="bulan_berlaku" defaultValue={selectedMonth} required /></Field><Field label="Tarif (%)"><input type="number" name="persen" min="0" max="100" step="0.01" required placeholder="0,50" /></Field><Field label="Dasar / catatan tarif" wide><textarea name="catatan" required maxLength={500} /></Field></div>
        <button className="btn primary" disabled={disabled}>Simpan versi tarif</button>
        {data.Tarif_Pajak.length > 0 && <div className="report-history"><h3>Riwayat tarif</h3>{data.Tarif_Pajak.map(r => <p key={text(r, "tarif_id")}><strong>{(num(r, "tarif_basis_poin") / 100).toLocaleString("id-ID")}%</strong> sejak {text(r, "berlaku_mulai")} · {text(r, "catatan")}</p>)}</div>}
      </form>}
      {manager === "payment" && <form key="payment" onSubmit={e => void submit(e, "report.tax.payment")}>
        <p className="form-hint">Tautkan pengeluaran yang sudah dicatat. Periode kewajiban boleh berbeda dengan tanggal bayar. Pelunasan utang mengurangi utang pajak; pilihan beban masuk ke laba rugi.</p>
        <div className="form-grid"><Field label="Transaksi kas keluar" wide><select name="transaksi_id" required><option value="">Pilih transaksi biaya</option>{data.Transaksi.filter(tx => tx.jenis === "BIAYA" && !data.Aset.some(a => a.transaksi_id === tx.transaksi_id) && !data.Transaksi.some(r => r.jenis === "PEMBALIK" && r.transaksi_rujukan_id === tx.transaksi_id)).map(tx => <option key={text(tx, "transaksi_id")} value={text(tx, "transaksi_id")}>{text(tx, "tanggal_transaksi")} · {text(tx, "deskripsi")} · {money(num(tx, "nominal"))}</option>)}</select></Field><Field label="Periode pajak" hint="Tahun (2025) atau bulan (2025-12)"><input name="periode_pajak" pattern="\d{4}(-(0[1-9]|1[0-2]))?" required placeholder="2025-12" /></Field><Field label="Perlakuan"><select name="perlakuan"><option value="BEBAN">Beban pajak</option><option value="PELUNASAN_UTANG">Pelunasan utang pajak</option></select></Field><Field label="Catatan / referensi" wide><textarea name="catatan" required maxLength={500} /></Field></div>
        <button className="btn primary" disabled={disabled}>Tautkan pembayaran pajak</button>
      </form>}
    </div>}
    {kind === "overview" ? <div className="legacy-report">{children}</div> : <article className={"report-document panel report-kind-" + kind}>
      <header className="report-document-heading"><div><span className="reports-kicker">{business}</span><h2>{title}</h2><p>{kind === "balance" ? "Posisi " + dateLabel(safeTo) : dateLabel(safeFrom) + " — " + dateLabel(safeTo)}{kind === "cash" && " · " + (text(data.Akun.find(a => a.akun_id === accountId), "nama_akun") || "Semua kas & bank")}</p></div><span className={"report-status " + (ready ? "ready" : "draft")}>{simulation ? "DATA CONTOH · " : ""}{statusText}</span></header>
      {kind !== "cash" && <p className="report-basis">Dasar: {reportSetting(data, "reporting_basis") === "KAS_DISESUAIKAN" ? "kas dengan penyesuaian nonkas" : "belum ditetapkan"} · awal pembukuan {dateLabel(anchor)}{kind === "tax" && " · omzet " + (tax.basis === "KAS_BRUTO" ? "penerimaan jasa bruto" : tax.basis === "PENDAPATAN_BERSIH" ? "pendapatan jasa setelah penyesuaian" : "belum ditetapkan")}</p>}
      {reportWarnings.length > 0 && <details className="report-draft-note" open={kind === "checks"}><summary>{futurePeriod && calculationReady ? "Periode belum berakhir · angka akhir merupakan proyeksi" : "Perlu dilengkapi sebelum laporan final"}</summary><ul>{reportWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>{owner && !calculationReady && <button className="text-btn no-report-print" onClick={() => beginManage("profile")}>Lengkapi pengaturan laporan</button>}</details>}
      {["cash", "assets", "tax"].includes(kind) && <p className="report-scroll-hint no-report-print">Geser tabel ke samping untuk melihat semua kolom.</p>}
      {kind === "cash" && <>
        <div className="report-metrics"><div><span>Saldo awal</span><strong>{money(book.opening)}</strong></div><div><span>Pemasukan</span><strong className="positive">{money(book.incoming)}</strong></div><div><span>Pengeluaran</span><strong className="negative">{money(book.outgoing)}</strong></div><div className="report-metric-final"><span>Saldo akhir</span><strong>{money(book.closing)}</strong></div></div>
        <div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Tanggal</th><th>Keterangan / akun</th><th className="numeric">Pemasukan</th><th className="numeric">Pengeluaran</th><th className="numeric">Saldo</th></tr></thead><tbody>
          <tr className="opening-row"><td>{dateLabel(safeFrom)}</td><td>Saldo awal periode</td><td className="numeric">—</td><td className="numeric">—</td><td className="numeric">{money(book.opening)}</td></tr>
          {book.lines.map(l => <tr key={l.id}><td>{dateLabel(l.date)}</td><td><strong>{l.description || "Transaksi"}</strong><small>{l.account}{l.internal ? " · transfer internal, neto nol" : l.opening ? " · pembukaan akun" : ""}</small><small className="report-reference">{l.reference || l.id}</small></td><td className="numeric">{l.incoming ? money(l.incoming) : "—"}</td><td className="numeric">{l.outgoing ? money(l.outgoing) : "—"}</td><td className="numeric">{money(l.balance)}</td></tr>)}
        </tbody><tfoot><tr><th colSpan={2}>Saldo akhir{book.additionalOpening !== 0 && <small>Tambahan saldo pembukaan akun {money(book.additionalOpening)}</small>}</th><th className="numeric">{money(book.incoming)}</th><th className="numeric">{money(book.outgoing)}</th><th className="numeric">{money(book.closing)}</th></tr></tfoot></table></div>
        {!book.lines.length && <p className="report-empty">Belum ada transaksi pada periode ini.</p>}
        <p className="report-footnote">Saldo awal dibawa dari histori sebelumnya. Transfer internal bernilai neto nol pada gabungan akun; pilih rekening untuk melihat mutasinya.</p>
      </>}
      {kind === "profit" && <div className="profit-statement">
        <h3>Pendapatan & biaya jasa</h3>{line("PENDAPATAN", report.income)}{line("BIAYA_JASA")}{totalLine("Laba kotor", report.grossProfit)}
        <h3>Biaya operasional</h3>{EXPENSE_ACCOUNTS.filter(k => !["BIAYA_JASA", "BEBAN_LAIN"].includes(k)).map(k => line(k))}
        {totalLine("Total biaya operasional", EXPENSE_ACCOUNTS.filter(k => !["BIAYA_JASA", "BEBAN_LAIN"].includes(k)).reduce((a, k) => a + report.period[k], 0))}
        <h3>Pendapatan & beban lain</h3>{line("PENDAPATAN_LAIN", -report.period.PENDAPATAN_LAIN)}{line("BEBAN_LAIN")}{report.period.BELUM_DIPETAKAN !== 0 && <><h3>Mutasi usaha belum dipetakan</h3>{line("BELUM_DIPETAKAN")}<p className="report-footnote">Nilai sementara ini belum ditetapkan sebagai kelompok pendapatan, biaya, atau aset. Lengkapi pemetaan dan tautan aset sebelum laporan final.</p></>}{totalLine(ready ? "Laba / rugi bersih" : "Laba / rugi sementara", report.netProfit, true)}
        <p className="report-footnote">Klik baris untuk melihat mutasi periode. Pembelian aset, modal, prive, serta pokok pinjaman dipisahkan dari laba/rugi.</p>
      </div>}
      {kind === "balance" && <div className="balance-statement"><section><h3>Aset lancar</h3>{(["KAS_BANK", "PIUTANG", "PERSEDIAAN", "SEWA_DIMUKA"] as ReportAccount[]).map(k => line(k, report.balances[k]))}<h3>Aset tetap</h3>{line("ASET_TETAP", report.balances.ASET_TETAP)}{line("AKUM_PENYUSUTAN", report.balances.AKUM_PENYUSUTAN)}{totalLine("Total aset", report.assetTotal, true)}</section><section><h3>Kewajiban</h3>{(["UTANG_USAHA", "UTANG_PAJAK", "PINJAMAN", "UANG_MUKA"] as ReportAccount[]).map(k => line(k, -report.balances[k]))}<h3>Ekuitas</h3>{line("MODAL", -report.balances.MODAL)}{totalLine("Laba ditahan", report.retained)}{totalLine("Laba berjalan tahun ini", report.currentProfit)}{line("PRIVE", -report.balances.PRIVE)}{totalLine("Total kewajiban & ekuitas", report.liabilities + report.equity, true)}</section></div>}
      {kind === "assets" && <>
        <div className="report-section-heading"><div><h3>Daftar aset</h3><p className="muted small">Nilai pada {dateLabel(safeTo)} · beban sesuai periode terpilih</p></div>{owner && <button className="btn no-report-print" onClick={() => beginManage("asset")}>Tambah aset</button>}</div>
        <div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Aset / sumber</th><th>Perolehan / mulai susut</th><th className="numeric">Umur</th><th className="numeric">Harga</th><th className="numeric">Beban periode</th><th className="numeric">Akumulasi</th><th className="numeric">Nilai buku</th>{owner && <th className="no-report-print">Tindakan</th>}</tr></thead><tbody>{report.assets.map(a => <tr key={text(a.asset, "aset_id")}><td><strong>{text(a.asset, "nama_aset")}</strong><small>{a.asset.sumber === "SALDO_AWAL" ? "Saldo awal aset" : "Tertaut ke pembelian"}</small></td><td>{dateLabel(text(a.asset, "tanggal_perolehan"))}<small>{text(a.asset, "tanggal_mulai").slice(0, 7)}</small></td><td className="numeric">{num(a.asset, "umur_bulan")} bln</td><td className="numeric">{money(a.cost)}</td><td className="numeric">{money(a.expense)}</td><td className="numeric">{money(a.accumulated)}</td><td className="numeric">{money(a.book)}</td>{owner && <td className="no-report-print"><button className="text-btn" disabled={disabled} onClick={() => beginManage("asset", a.asset)}>Ubah</button></td>}</tr>)}</tbody><tfoot><tr><th colSpan={3}>Total</th><th className="numeric">{money(report.assets.reduce((a, r) => a + r.cost, 0))}</th><th className="numeric">{money(report.assets.reduce((a, r) => a + r.expense, 0))}</th><th className="numeric">{money(report.assets.reduce((a, r) => a + r.accumulated, 0))}</th><th className="numeric">{money(report.assets.reduce((a, r) => a + r.book, 0))}</th>{owner && <th className="no-report-print" />}</tr></tfoot></table></div>
        {!report.assets.length && <p className="report-empty">Belum ada aset pada tanggal ini. Catat aset lama sebagai saldo awal atau tautkan pembelian yang sudah dicatat.</p>}
        <h3 className="asset-schedule-heading">Jadwal penyusutan {assetYear}</h3><p className="report-footnote">Jadwal satu tahun penuh; angka setelah tanggal laporan merupakan proyeksi berdasarkan data saat ini.</p>
        <div className="financial-table-wrap asset-schedule"><table className="financial-table"><thead><tr><th>Aset</th>{yearColumns.map(m => <th className="numeric" key={m}>{new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"))}</th>)}<th className="numeric">Total tahun</th></tr></thead><tbody>{data.Aset.filter(a => text(a, "tanggal_perolehan").slice(0, 4) <= assetYear).map(a => {
          const monthly = yearColumns.map(m => assetPeriodExpense(data, a, m + "-01", endOfMonth(m)));
          return <tr key={text(a, "aset_id")}><td>{text(a, "nama_aset")}</td>{monthly.map((v, i) => <td className="numeric" key={i}>{v.toLocaleString("id-ID")}</td>)}<td className="numeric">{monthly.reduce((x, v) => x + v, 0).toLocaleString("id-ID")}</td></tr>;
        })}</tbody></table></div>
      </>}
      {kind === "tax" && <>
        <div className="report-metrics"><div><span>Omzet periode</span><strong>{money(tax.turnover)}</strong></div><div><span>Perhitungan pajak</span><strong>{tax.total === null ? "Belum lengkap" : money(tax.total)}</strong></div><div><span>Dibayar untuk periode terpilih</span><strong>{money(tax.rows.reduce((a, r) => a + r.paid, 0))}</strong></div></div>
        <div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Bulan</th><th className="numeric">Omzet</th><th className="numeric">Tarif</th><th className="numeric">Perhitungan pajak</th><th className="numeric">Dibayar untuk bulan ini</th></tr></thead><tbody>{tax.rows.map(r => <tr key={r.month}><td>{r.month}{!r.completeMonth && <small>Periode sebagian</small>}</td><td className="numeric">{money(r.turnover)}</td><td className="numeric">{r.basisPoints === null ? "Belum diatur" : (r.basisPoints / 100).toLocaleString("id-ID") + "%"}</td><td className="numeric">{r.tax === null ? "—" : money(r.tax)}</td><td className="numeric">{money(r.paid)}</td></tr>)}</tbody><tfoot><tr><th>Total</th><th className="numeric">{money(tax.turnover)}</th><th /><th className="numeric">{tax.total === null ? "Belum lengkap" : money(tax.total)}</th><th className="numeric">{money(tax.rows.reduce((a, r) => a + r.paid, 0))}</th></tr></tfoot></table></div>
        <p className="report-footnote">Perhitungan mengikuti dasar dan tarif yang ditetapkan pemilik. Pembayaran untuk satu tahun penuh ditampilkan terpisah dan tidak dibagi otomatis ke setiap bulan.</p>
        <div className="report-section-heading"><h3>Pembayaran kas pada periode ini</h3>{owner && <button className="btn no-report-print" onClick={() => beginManage("payment")}>Tautkan pembayaran</button>}</div>
        <div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Tanggal bayar</th><th>Periode kewajiban</th><th>Keterangan</th><th className="numeric">Nominal</th></tr></thead><tbody>{tax.payments.map(p => <tr key={text(p, "pembayaran_id")}><td>{dateLabel(p.date)}</td><td>{text(p, "periode_pajak")}</td><td>{p.description}<small>{text(p, "perlakuan") === "PELUNASAN_UTANG" ? "Pelunasan utang pajak" : "Beban pajak"}</small></td><td className="numeric">{money(p.amount)}</td></tr>)}</tbody></table></div>
        {!tax.payments.length && <p className="report-empty">Belum ada pembayaran pajak yang ditautkan pada periode ini.</p>}
      </>}
      {kind === "checks" && <div className="report-checks">{report.checks.map(c => <div className={"report-check " + (c.difference === 0 ? "matched" : "unmatched")} key={c.label}><div><h3>{c.label}</h3><p>{c.detail}</p></div><strong>{c.difference === 0 ? "Cocok" : "Selisih " + money(c.difference)}</strong></div>)}<p className="report-footnote">Pemeriksaan ini membandingkan angka antar laporan. Pemeriksaan kas fisik dan mutasi bank tetap tersedia di Ringkasan kas melalui Cocokkan saldo / tutup bulan.</p></div>}
      {(kind === "profit" || kind === "balance" || kind === "checks") && <details className="report-sources no-report-print" open={Boolean(detailAccount)}>
        <summary onClick={() => { if (detailAccount) setDetailAccount(null); }}>Mutasi periode {detailAccount ? "· " + REPORT_ACCOUNTS[detailAccount] : "dan referensi sumber"}</summary>
        <div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Tanggal</th><th>Kelompok / keterangan</th><th>Referensi</th><th className="numeric">Debit − kredit</th></tr></thead><tbody>{report.sources.filter(r => detailAccount ? r.account === detailAccount : r.account !== "KAS_BANK").map((r, i) => <tr key={i}><td>{dateLabel(r.date)}</td><td>{REPORT_ACCOUNTS[r.account]}<small>{r.description} · {r.type}</small></td><td className="report-reference">{r.reference}</td><td className="numeric">{money(r.value)}</td></tr>)}</tbody></table></div>
        <p className="report-footnote">Rincian ini menampilkan mutasi periode terpilih. Saldo neraca juga mencakup pembukaan dan histori sebelum periode tersebut.</p>
      </details>}
      <footer className="report-document-footer"><p>{simulation ? "Data simulasi" : "Sumber Google Sheets"} · Data {dataAsOf ? new Date(dataAsOf).toLocaleString("id-ID", { timeZone: setting(data, "timezone", "Asia/Jakarta") }) : "sesi saat ini"} · {statusText}</p><div className="report-signature"><p>{reportSetting(data, "report_location")}{reportSetting(data, "report_location") ? ", " : ""}{dateLabel(today(setting(data, "timezone", "Asia/Jakarta")))}</p><div /><strong>{reportSetting(data, "report_signer") || "________________________"}</strong><span>{reportSetting(data, "report_position") || "Penanggung jawab"}</span></div></footer>
    </article>}
    {kind === "checks" && journalGroups.length > 0 && <section className="panel report-journals no-report-print"><div className="report-section-heading"><h2>Jurnal penyesuaian nonkas</h2>{owner && <button className="btn" onClick={() => beginManage("journal")}>Tambah jurnal</button>}</div>{journalGroups.map(id => {
      const rows = data.Jurnal_Laporan.filter(r => r.jurnal_id === id), r = rows[0];
      const reversed = data.Jurnal_Laporan.some(j => j.jurnal_rujukan_id === id);
      return <details key={id}><summary>{text(r, "tanggal")} · {text(r, "deskripsi")} <small>{r.jurnal_rujukan_id ? "Pembalik" : reversed ? "Sudah dibalik" : "Tersimpan"}</small></summary>{rows.map(row => <div className="statement-line" key={text(row, "baris_id")}><span>{REPORT_ACCOUNTS[text(row, "akun_laporan") as ReportAccount]}</span><strong>D {money(num(row, "debit"))} · K {money(num(row, "kredit"))}</strong></div>)}<small className="report-reference">{id} · {text(r, "rujukan")}</small>{owner && !reversed && !r.jurnal_rujukan_id && <form onSubmit={e => void submit(e, "report.journal.reverse", v => ({ ...v, jurnal_id: id }))}><div className="form-grid"><Field label="Tanggal pembalik"><input name="tanggal" type="date" defaultValue={safeTo} min={text(r, "tanggal")} required /></Field><Field label="Alasan pembalik"><input name="deskripsi" required maxLength={500} /></Field></div><button className="btn" disabled={disabled}>Balik jurnal</button></form>}</details>;
    })}</section>}
  </div>;
}
