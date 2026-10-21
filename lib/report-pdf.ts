import { jsPDF } from "jspdf";
import { autoTable, type Styles, type Table } from "jspdf-autotable";
import type { ReportDocument, PdfTable } from "./report-document.ts";

export type PdfFonts = { regular: Uint8Array; bold: Uint8Array };
const ink = "#172B25", muted = "#54645D", green = "#295445", line = "#D8DFDA";
const clean = (value: string) => value.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\u00a0/g, " ").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function createReportPdf(fonts: PdfFonts, landscape = false) {
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
  doc.addFileToVFS("TerraceReport-Regular.ttf", base64(fonts.regular));
  doc.addFont("TerraceReport-Regular.ttf", "TerraceReport", "normal");
  doc.addFileToVFS("TerraceReport-Bold.ttf", base64(fonts.bold));
  doc.addFont("TerraceReport-Bold.ttf", "TerraceReport", "bold");
  doc.setFont("TerraceReport", "normal");
  doc.setLanguage("id");
  return doc;
}

/** Append to a fresh page; the book renderer can supply one global page count. */
export function appendReportPages(doc: jsPDF, model: ReportDocument, pageNumbers = true) {
  const startPage = doc.getNumberOfPages();
  doc.setPage(startPage);
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 15, contentWidth = width - margin * 2;
  const bottom = height - 21;
  doc.setFontSize(10);
  const businessLines: string[] = doc.splitTextToSize(clean(model.business.toUpperCase()), contentWidth);
  doc.setFontSize(15);
  const titleLines: string[] = doc.splitTextToSize(clean(model.title), contentWidth);
  doc.setFontSize(8.7);
  const periodLines: string[] = doc.splitTextToSize(clean(model.period), contentWidth);
  const top = 14 + businessLines.length * 4.5 + 2 + titleLines.length * 6 + 1 + periodLines.length * 4 + 10;
  let y = top + 3;

  function newPage() { doc.addPage("a4", model.landscape ? "landscape" : "portrait"); y = top + 3; }
  function reserve(mm: number) { if (y + mm > bottom) newPage(); }
  function paragraph(value: string, size = 8.2, color = muted) {
    doc.setFont("TerraceReport", "normal"); doc.setFontSize(size); doc.setTextColor(color);
    const lines: string[] = doc.splitTextToSize(clean(value), contentWidth);
    for (const valueLine of lines) {
      reserve(4.3);
      doc.text(valueLine, margin, y + 3);
      y += 4.3;
    }
    y += 2;
  }
  function heading(value: string) {
    doc.setFont("TerraceReport", "bold"); doc.setFontSize(10);
    const lines: string[] = doc.splitTextToSize(clean(value), contentWidth);
    reserve(lines.length * 4.7 + 16);
    doc.setTextColor(ink);
    doc.text(lines, margin, y + 3.5, { lineHeightFactor: 1.3 });
    y += lines.length * 4.7 + 3;
  }
  function table(value: PdfTable) {
    if (value.pageBreak) newPage();
    if (value.title) heading(value.title);
    reserve(18);
    const weight = value.columns.reduce((a, c) => a + c.weight, 0);
    const columns: Record<number, Partial<Styles>> = Object.fromEntries(value.columns.map((column, i) => [i, {
      cellWidth: contentWidth * column.weight / weight,
      halign: column.numeric ? "right" : "left",
    }]));
    autoTable(doc, {
      startY: y, margin: { top: top + 3, bottom: height - bottom, left: margin, right: margin },
      tableWidth: contentWidth, theme: "plain", showHead: "everyPage", showFoot: "never", rowPageBreak: "avoid",
      styles: { font: "TerraceReport", fontStyle: "normal", fontSize: model.kind === "assets" ? 8 : 8.8, textColor: ink, cellPadding: { top: model.kind === "balance" ? .75 : 1.25, bottom: model.kind === "balance" ? .75 : 1.25, left: 2.3, right: 2.3 }, overflow: "linebreak", lineColor: line, lineWidth: { bottom: .15 }, valign: "middle" },
      headStyles: { fontStyle: "bold", textColor: "#FFFFFF", fillColor: green, fontSize: 8.2, lineWidth: 0, cellPadding: 2.5 },
      columnStyles: columns,
      head: [value.columns.map(c => clean(c.label))],
      body: value.rows.length ? value.rows.map(r => r.cells.map(clean)) : [[{ content: "Belum ada data pada periode ini.", colSpan: value.columns.length }]],
      didParseCell(hook) {
        if (hook.section !== "body") return;
        const style = value.rows[hook.row.index]?.style;
        if (style) {
          hook.cell.styles.fontStyle = "bold";
          hook.cell.styles.fillColor = style === "result" ? "#E6EEE8" : style === "section" ? "#F0F3F0" : "#F8F9F7";
          if (style === "result") hook.cell.styles.lineWidth = { top: .4, bottom: .4 };
        }
      },
    });
    y = ((doc as jsPDF & { lastAutoTable: Table }).lastAutoTable.finalY ?? y) + (model.kind === "balance" ? 4 : 7);
    if (value.note) paragraph(value.note, 7.8);
  }

  paragraph(model.basis);
  paragraph("Satuan: rupiah (Rp). Nilai dalam tanda kurung menunjukkan angka negatif.", 7.8);
  if (model.warnings.length) paragraph("Status laporan memerlukan perhatian. Lihat catatan pemeriksaan di bagian akhir.", 8.2, "#7A4F20");
  for (const value of model.tables) table(value);
  if (model.warnings.length) table({
    title: "Catatan pemeriksaan", columns: [{ label: "Hal yang perlu diperhatikan", weight: 1 }],
    rows: model.warnings.map((warning, i) => ({ cells: [String(i + 1) + ". " + warning] })),
  });
  for (const note of model.notes) paragraph(note);

  // Keep the entire signature together, moving to a new page when necessary.
  doc.setFontSize(9);
  const signatureWidth = Math.min(90, contentWidth * .55);
  const dateLines: string[] = doc.splitTextToSize(clean((model.location ? model.location + ", " : "") + model.issued), signatureWidth);
  const signerLines: string[] = doc.splitTextToSize(clean(model.signer), signatureWidth);
  const positionLines: string[] = doc.splitTextToSize(clean(model.position), signatureWidth);
  reserve(27 + (dateLines.length + signerLines.length + positionLines.length) * 4.5);
  const signatureX = width - margin - signatureWidth / 2;
  y += 4;
  doc.setTextColor(ink); doc.setFont("TerraceReport", "normal");
  doc.text(dateLines, signatureX, y + 3, { align: "center", lineHeightFactor: 1.35 });
  y += dateLines.length * 4.5 + 22;
  doc.setFont("TerraceReport", "bold");
  doc.text(signerLines, signatureX, y, { align: "center", lineHeightFactor: 1.35 });
  y += signerLines.length * 4.5;
  doc.setFont("TerraceReport", "normal");
  doc.text(positionLines, signatureX, y, { align: "center", lineHeightFactor: 1.35 });

  // Draw once per physical page after pagination so every footer has a true total.
  const pages = doc.getNumberOfPages();
  for (let page = startPage; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("TerraceReport", "bold"); doc.setFontSize(10); doc.setTextColor(ink);
    let headerY = 14;
    doc.text(businessLines, margin, headerY, { lineHeightFactor: 1.27 });
    headerY += businessLines.length * 4.5 + 2;
    doc.setFontSize(15); doc.text(titleLines, margin, headerY, { lineHeightFactor: 1.13 });
    headerY += titleLines.length * 6 + 1;
    doc.setFont("TerraceReport", "normal"); doc.setFontSize(8.7); doc.setTextColor(muted);
    doc.text(periodLines, margin, headerY, { lineHeightFactor: 1.3 });
    headerY += periodLines.length * 4 + 2;
    doc.setFont("TerraceReport", "bold"); doc.setFontSize(7.8); doc.setTextColor(green);
    doc.text(clean(model.status), margin, headerY);
    doc.setDrawColor(green); doc.setLineWidth(.5); doc.line(margin, top - 3, width - margin, top - 3);
    doc.setDrawColor(line); doc.setLineWidth(.2); doc.line(margin, height - 16, width - margin, height - 16);
    doc.setFont("TerraceReport", "normal"); doc.setFontSize(7); doc.setTextColor(muted);
    const footer: string[] = doc.splitTextToSize(clean(model.source + " | Data: " + model.dataTime + " | Terbit: " + model.issued), contentWidth - 29);
    doc.text(footer.slice(0, 2), margin, height - 11, { lineHeightFactor: 1.2 });
    if (pageNumbers) doc.text("Halaman " + (page - startPage + 1) + " / " + (pages - startPage + 1), width - margin, height - 11, { align: "right" });
  }
  return { startPage, pageCount: pages - startPage + 1 };
}

/** Vector text/tables, independent of viewport size, scroll position, and theme. */
export function renderReportPdf(model: ReportDocument, fonts: PdfFonts) {
  const doc = createReportPdf(fonts, model.landscape);
  doc.setProperties({ title: model.title + " | " + model.business, subject: model.period + " | " + model.status, author: model.business, creator: "Garda Keuangan" });
  appendReportPages(doc, model);
  return new Uint8Array(doc.output("arraybuffer"));
}

let fontRequest: Promise<PdfFonts> | undefined;
export function loadReportFonts() {
  fontRequest ??= Promise.all(["regular", "bold"].map(async weight => {
    const response = await fetch("/fonts/terrace-report-" + weight + ".ttf");
    if (!response.ok) throw new Error("Font PDF belum dapat dimuat. Periksa koneksi lalu coba lagi.");
    return new Uint8Array(await response.arrayBuffer());
  })).then(([regular, bold]) => ({ regular, bold })).catch(error => { fontRequest = undefined; throw error; });
  return fontRequest;
}
