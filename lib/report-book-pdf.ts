import type { jsPDF } from "jspdf";
import { autoTable, type Table } from "jspdf-autotable";
import type { AnnualReport } from "./report-book.ts";
import { pdfAmount } from "./report-document.ts";
import { appendReportPages, createReportPdf, type PdfFonts } from "./report-pdf.ts";

const ink = "#172B25", green = "#295445", muted = "#627168", soft = "#EDF2EB", border = "#D8DFDA", tan = "#B7A88B";
const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const clean = (v: string) => v.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\u00a0/g, " ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const money = (n: number) => "Rp" + pdfAmount(n);
type SectionLocation = { title: string; subtitle: string; startPage: number; pageCount: number };

/** One vector PDF with mixed page orientations, internal links and global numbering. */
export function renderAnnualReportPdf(model: AnnualReport, fonts: PdfFonts) {
  const doc = createReportPdf(fonts), margin = 15, width = 210, content = 180;
  const t = model.totals;
  doc.setProperties({ title: model.title + " " + model.year + " | " + model.business, subject: model.status + " | Semua kas dan bank", author: model.business, creator: "Garda Keuangan" });
  function label(value: string, x: number, y: number, size = 9, bold = false, color = ink, align: "left" | "right" = "left") {
    doc.setFont("TerraceReport", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color);
    doc.text(clean(value), x, y, { align });
  }
  function paragraph(value: string, y: number, size = 9, color = muted, x = margin, maxWidth = content, bold = false) {
    doc.setFont("TerraceReport", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color);
    const lines: string[] = doc.splitTextToSize(clean(value), maxWidth);
    const leading = size * .48;
    doc.text(lines, x, y, { lineHeightFactor: 1.36 });
    return y + lines.length * leading;
  }
  function common() {
    const end = paragraph(model.business.toUpperCase(), 16, 9.5, green, margin, content, true);
    doc.setDrawColor(green); doc.setLineWidth(.6); doc.line(margin, end + 2, width - margin, end + 2);
    return end + 15;
  }
  function box(y: number, height: number) { doc.setFillColor(soft); doc.roundedRect(margin, y, content, height, 3, 3, "F"); }
  function fitted(value: string, x: number, y: number, maxWidth: number, size: number, color = green) {
    doc.setFont("TerraceReport", "bold"); doc.setFontSize(size);
    while (doc.getTextWidth(clean(value)) > maxWidth && size > 7) { size -= .5; doc.setFontSize(size); }
    label(value, x, y, size, true, color);
  }
  function frontFooter(page: number) {
    doc.setPage(page);
    doc.setDrawColor(border); doc.setLineWidth(.2); doc.line(margin, 281, width - margin, 281);
    paragraph(model.source + " | Data: " + model.dataTime + " | Terbit: " + model.issued, 286, 7, muted, margin, content - 29);
  }

  // Cover. The contents have their own page so long report names stay readable.
  let y = common() + 13;
  label("LAPORAN", margin, y, 29, true); y += 12;
  label("KEUANGAN", margin, y, 29, true); y += 17;
  label("Tahun buku " + model.year, margin, y, 25, true, green); y += 10;
  y = paragraph("1 Januari - 31 Desember " + model.year + " | Semua kas dan bank", y, 10) + 9;
  box(y, 11); label(model.status, margin + 4, y + 7, 8.5, true, green); y += 22;
  const cards = [["PENDAPATAN JASA", t.income], ["LABA / RUGI BERSIH", t.netProfit], ["KAS DAN BANK AKHIR", t.closing]] as const;
  for (const [i, [title, value]] of cards.entries()) {
    const x = margin + i * 61.5;
    doc.setFillColor(soft); doc.roundedRect(x, y, 57, 27, 3, 3, "F");
    label(title, x + 3.5, y + 8, 7.1, true, muted);
    fitted(money(value), x + 3.5, y + 20, 50, 15);
  }
  y += 40;
  label("12 bulan. Enam laporan. Satu sumber data.", margin, y, 12, true); y += 9;
  y = paragraph("Ringkasan tahunan, grafik arus kas, laba rugi, neraca, aset dan penyusutan, omzet dan pajak, buku kas bulanan, serta pemeriksaan antar laporan.", y, 10) + 10;
  y = paragraph(model.basis, y, 8.5) + 7;
  paragraph(model.simulation
    ? "DATA CONTOH. Angka, identitas, saldo awal, dan tarif pajak menggunakan simulasi untuk meninjau hasil aplikasi. Data ini tersimpan terpisah dari pembukuan usaha."
    : "Paket dihitung dari data pada waktu pengunduhan. Periksa status dan catatan pada setiap laporan sebelum digunakan atau ditandatangani.", y, 8.5);
  label(model.detail ? "Rincian sesuai akses pengguna" : "Akses ringkasan | Rincian transaksi dibatasi", margin, 267, 8, false, muted);

  doc.addPage("a4", "portrait"); // Contents filled after real pagination.
  doc.addPage("a4", "portrait");
  const summaryPage = doc.getNumberOfPages();
  y = common();
  label("Ringkasan tahun " + model.year, margin, y, 21, true); y += 8;
  y = paragraph("Penerimaan dan kas keluar per bulan. Transfer internal dihitung neto nol.", y, 8.7) + 8;

  // A zero-safe scale and vector bars keep the chart crisp on paper and phones.
  const max = Math.max(0, ...model.monthly.flatMap(m => [m.incoming, m.outgoing]));
  const roughStep = Math.max(max / 4, 1), power = 10 ** Math.floor(Math.log10(roughStep));
  const step = ([1, 2, 5, 10].find(n => n * power >= roughStep) || 10) * power;
  const ceiling = step * 4, chartLeft = 32, chartWidth = 162, chartHeight = 42, chartBottom = y + chartHeight;
  const tickText = (n: number) => n >= 1e9 ? (n / 1e9).toLocaleString("id-ID") + " M"
    : n >= 1e6 ? (n / 1e6).toLocaleString("id-ID") + " jt" : n >= 1e3 ? (n / 1e3).toLocaleString("id-ID") + " rb" : pdfAmount(n);
  for (let i = 0; i <= 4; i++) {
    const yy = chartBottom - i / 4 * chartHeight;
    doc.setDrawColor(border); doc.setLineWidth(.15); doc.line(chartLeft, yy, chartLeft + chartWidth, yy);
    label(tickText(i * step), chartLeft - 3, yy + 1, 6.8, false, muted, "right");
  }
  model.monthly.forEach((m, i) => {
    const x = chartLeft + i * chartWidth / 12 + 3;
    for (const [offset, value, color] of [[0, m.incoming, green], [4, m.outgoing, tan]] as const) {
      const barHeight = Math.max(0, value) / ceiling * chartHeight;
      if (barHeight) { doc.setFillColor(color); doc.rect(x + offset, chartBottom - barHeight, 3.2, barHeight, "F"); }
    }
    label(months[i].slice(0, 3).toUpperCase(), x, chartBottom + 4.5, 6.5, false, muted);
  });
  doc.setFillColor(green); doc.rect(margin, chartBottom + 10, 3, 3, "F");
  label("Penerimaan", margin + 5, chartBottom + 12.5, 7.5, false, muted);
  doc.setFillColor(tan); doc.rect(margin + 34, chartBottom + 10, 3, 3, "F");
  label("Kas keluar", margin + 39, chartBottom + 12.5, 7.5, false, muted);
  y = chartBottom + 22;
  label("Rekap bulanan (Rp)", margin, y, 10, true); y += 5;
  autoTable(doc, {
    startY: y, margin: { top: 38, bottom: 23, left: margin, right: margin }, tableWidth: content,
    theme: "plain", showHead: "everyPage", rowPageBreak: "avoid",
    styles: { font: "TerraceReport", fontSize: 8, textColor: ink, cellPadding: 1.8, lineColor: border, lineWidth: { bottom: .15 }, valign: "middle", halign: "right" },
    headStyles: { fillColor: green, textColor: "#FFFFFF", fontStyle: "bold", fontSize: 7.5, cellPadding: 2.4 },
    alternateRowStyles: { fillColor: "#F8FAF6" }, columnStyles: { 0: { cellWidth: 40, halign: "left" }, 1: { cellWidth: 35 }, 2: { cellWidth: 35 }, 3: { cellWidth: 35 }, 4: { cellWidth: 35 } },
    head: [["Bulan", "Penerimaan", "Kas keluar", "Saldo akhir", "Laba / rugi"]],
    body: [...model.monthly.map((m, i) => [months[i], pdfAmount(m.incoming), pdfAmount(m.outgoing), pdfAmount(m.closing), pdfAmount(m.netProfit)]),
      ["TOTAL / POSISI AKHIR", pdfAmount(t.incoming), pdfAmount(t.outgoing), pdfAmount(t.closing), pdfAmount(t.netProfit)]],
    didParseCell(hook) {
      if (hook.column.index === 0) hook.cell.styles.halign = "left";
      if (hook.section === "body" && hook.row.index === 12) { hook.cell.styles.fontStyle = "bold"; hook.cell.styles.fillColor = soft; hook.cell.styles.fontSize = 7.5; }
    },
  });
  y = ((doc as jsPDF & { lastAutoTable: Table }).lastAutoTable.finalY ?? y) + 8;
  const notes = [
    "Saldo awal " + money(t.opening) + (t.additionalOpening ? " + tambahan pembukaan " + money(t.additionalOpening) : "") + " + penerimaan " + money(t.incoming) + " - kas keluar " + money(t.outgoing) + " = saldo akhir " + money(t.closing) + ".",
    "Saldo pada baris TOTAL adalah posisi akhir Desember. Penyusutan " + money(t.depreciation) + " merupakan beban nonkas; pembelian aset dan pelunasan kewajiban memengaruhi kas sesuai pencatatannya.",
    "Perhitungan pajak tahun " + model.year + ": " + (t.tax === null ? "belum lengkap" : money(t.tax)) + ". Kas pembayaran pajak pada tahun ini " + money(t.taxPaid) + "; pembayaran untuk kewajiban bulanan tahun ini " + money(t.taxForPeriodPaid) + ". Rincian periode kewajiban ada pada bagian pajak.",
    "Pemeriksaan: " + t.checksMatched + " dari " + t.checksTotal + " perbandingan berselisih nol. Status paket: " + model.status + ". " + (model.status.endsWith("DRAF") ? "Lengkapi dasar, saldo awal, pemetaan, dan tarif sesuai catatan pada tiap bagian." : model.status.endsWith("PROYEKSI") ? "Periode belum berakhir; angka setelah tanggal pembuatan merupakan proyeksi." : "Laporan tersedia untuk pemeriksaan dan tanda tangan."),
  ];
  for (const note of notes) {
    doc.setFontSize(8);
    const needed = (doc.splitTextToSize(clean(note), content) as string[]).length * 3.84 + 3;
    if (y + needed > 273) { doc.addPage("a4", "portrait"); y = common(); label("Catatan ringkasan tahunan", margin, y, 17, true); y += 11; }
    y = paragraph(note, y, 8) + 3;
  }
  const frontPages = doc.getNumberOfPages();
  const locations: SectionLocation[] = [];
  const subtitles = {
    profit: "Pendapatan, biaya, dan hasil usaha",
    balance: "Posisi aset, kewajiban, dan ekuitas",
    assets: "Daftar aset serta jadwal dua semester",
    tax: model.detail ? "Rekap bulanan dan riwayat pembayaran" : "Rekap omzet dan perhitungan bulanan",
    cash: model.detail ? "Januari-Desember dan ringkasan periode" : "Ringkasan kas sesuai hak akses",
    checks: "Pencocokan angka antar laporan",
  };
  for (const section of model.sections) {
    doc.addPage("a4", section.landscape ? "landscape" : "portrait");
    locations.push({ title: section.title, subtitle: subtitles[section.kind], ...appendReportPages(doc, section, false) });
  }

  doc.setPage(2); y = common();
  label("Daftar isi", margin, y, 24, true); y += 9;
  y = paragraph("Klik judul untuk langsung menuju bagian laporan. Nomor halaman mengikuti isi PDF ini.", y, 9) + 12;
  const entries = [{ title: "Ringkasan tahunan dan grafik", subtitle: "Arus kas 12 bulan dan penjelasan angka", startPage: summaryPage, pageCount: frontPages - summaryPage + 1 }, ...locations];
  for (const [i, entry] of entries.entries()) {
    const rowTop = y - 5;
    label(i === 0 ? "R" : String(i).padStart(2, "0"), margin, y, 10, true, green);
    label(entry.title, margin + 12, y, 11, true);
    label(entry.subtitle, margin + 12, y + 5.5, 8.2, false, muted);
    const end = entry.startPage + entry.pageCount - 1;
    label(String(entry.startPage) + (end === entry.startPage ? "" : "-" + end), width - margin, y + 1, 11, true, green, "right");
    doc.link(margin, rowTop, content, 17, { pageNumber: entry.startPage, top: 0 });
    doc.setDrawColor(border); doc.setLineWidth(.2); doc.line(margin, y + 11, width - margin, y + 11);
    y += 23;
  }
  box(y, 27);
  paragraph("Cakupan paket", y + 7, 9, ink, margin + 4, content - 8, true);
  paragraph("Satu tahun kalender penuh, seluruh kas dan bank, serta rincian sesuai hak akses. Status dan catatan masing-masing bagian tetap disertakan.", y + 13, 8.5, muted, margin + 4, content - 8);

  doc.outline.add(null, "Sampul", { pageNumber: 1 });
  doc.outline.add(null, "Daftar isi", { pageNumber: 2 });
  for (const entry of entries) doc.outline.add(null, entry.title, { pageNumber: entry.startPage });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    if (page <= frontPages) frontFooter(page);
    doc.setPage(page);
    label("Halaman " + page + " / " + pages, doc.internal.pageSize.getWidth() - margin, doc.internal.pageSize.getHeight() - 11, 7, false, muted, "right");
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
