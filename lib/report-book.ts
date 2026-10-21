import type { Actor, State } from "./domain.ts";
import { buildReportDocument, validReportRange, type PdfReportKind, type ReportDocument } from "./report-document.ts";
import { cashbook, financialStatements, monthEnd, taxReport } from "./reporting.ts";

export const ANNUAL_REPORT_ORDER: PdfReportKind[] = ["profit", "balance", "assets", "tax", "cash", "checks"];
export type AnnualReportOptions = {
  year: string;
  role: Actor["role"];
  simulation: boolean;
  dataAsOf: string;
  generatedAt?: string;
};
export type AnnualReport = {
  year: string;
  filename: string;
  title: string;
  business: string;
  status: string;
  source: string;
  dataTime: string;
  issued: string;
  basis: string;
  simulation: boolean;
  detail: boolean;
  sections: ReportDocument[];
  monthly: { month: string; opening: number; additionalOpening: number; incoming: number; outgoing: number; closing: number; netProfit: number }[];
  totals: {
    income: number; directCosts: number; netProfit: number; depreciation: number;
    opening: number; additionalOpening: number; incoming: number; outgoing: number; closing: number;
    assets: number; liabilities: number; equity: number;
    tax: number | null; taxPaid: number; taxForPeriodPaid: number;
    checksMatched: number; checksTotal: number;
  };
};

/** A complete calendar year only, including custom ranges that exactly cover it. */
export function annualYearFromRange(from: string, to: string) {
  const year = from.slice(0, 4);
  return validReportRange(from, to) && from === year + "-01-01" && to === year + "-12-31" ? year : null;
}

/** Capture everything before async rendering; never retain mutable State rows. */
export function buildAnnualReport(data: State, options: AnnualReportOptions): AnnualReport {
  const { year, role, simulation, dataAsOf } = options;
  const from = year + "-01-01", to = year + "-12-31";
  if (!/^\d{4}$/.test(year) || !annualYearFromRange(from, to)) throw new Error("Pilih satu tahun lengkap antara 1900 dan 9998.");
  const generatedAt = options.generatedAt || new Date().toISOString();
  // No account filter: every section must agree with the all-account balance sheet.
  const sections = ANNUAL_REPORT_ORDER.map(kind => buildReportDocument(data, { kind, from, to, role, simulation, dataAsOf, generatedAt }));
  const first = sections[0];
  const status = sections.some(s => s.status.endsWith("DRAF")) ? "DRAF"
    : sections.some(s => s.status.endsWith("PROYEKSI")) ? "PROYEKSI" : "SIAP DIPERIKSA";
  const report = financialStatements(data, from, to), book = cashbook(data, from, to), tax = taxReport(data, from, to);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const month = year + "-" + String(i + 1).padStart(2, "0"), end = monthEnd(month);
    const cash = cashbook(data, month + "-01", end);
    return { month, opening: cash.opening, additionalOpening: cash.additionalOpening, incoming: cash.incoming, outgoing: cash.outgoing, closing: cash.closing, netProfit: financialStatements(data, month + "-01", end).netProfit };
  });
  return {
    year, filename: "garda-semua-laporan-" + year + ".pdf", title: "Laporan Keuangan Tahunan",
    business: first.business, status: (simulation ? "DATA CONTOH | " : "") + status,
    source: first.source, dataTime: first.dataTime, issued: first.issued, basis: first.basis,
    simulation, detail: role !== "VIEWER", sections, monthly,
    totals: {
      income: report.income, directCosts: report.directCosts, netProfit: report.netProfit, depreciation: report.period.PENYUSUTAN,
      opening: book.opening, additionalOpening: book.additionalOpening, incoming: book.incoming, outgoing: book.outgoing, closing: book.closing,
      assets: report.assetTotal, liabilities: report.liabilities, equity: report.equity,
      tax: tax.total, taxPaid: tax.payments.reduce((sum, p) => sum + p.amount, 0), taxForPeriodPaid: tax.rows.reduce((sum, r) => sum + r.paid, 0),
      checksMatched: report.checks.filter(c => c.difference === 0).length, checksTotal: report.checks.length,
    },
  };
}
