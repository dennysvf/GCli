import { csvAmount, type CsvCell } from "@/shared/i18n/csv";
import { formatDate, formatLocale, formatMoney, formatNumber } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import type { Translator } from "@/shared/i18n/translator";
import type { Currency } from "@/shared/kernel/countries/codes";
import type { ColumnDef, Money, RawCell, RawRow, ReportId, Totals } from "./types";

// Tones of the status stamps (design system 5.5).
export type StampTone = "neutral" | "strong" | "cancelled" | "success" | "warning" | "danger" | "info";
export type ViewCell = string | { text: string; tone: StampTone };
export type ViewColumn = { key: string; label: string; align: "left" | "right"; kind: ColumnDef["kind"] };

const NO_VALUE = "—";

const STAMP_TONES: Record<string, StampTone> = {
  SCHEDULED: "neutral",
  CONFIRMED: "success",
  CHECKED_IN: "info",
  IN_PROGRESS: "info",
  COMPLETED: "strong",
  NO_SHOW: "danger",
  CANCELLED: "cancelled",
  PAYMENT: "success",
  REFUND: "warning",
};

function isMoney(cell: RawCell): cell is Money {
  return typeof cell === "object" && cell !== null;
}

export function columnLabel(column: ColumnDef, t: Translator, groupBy: string): string {
  return column.key === "group"
    ? t(`analytics.reports.groupLabels.${groupBy}`)
    : t(`analytics.reports.columns.${column.key}`);
}

export function viewColumns(columns: ColumnDef[], t: Translator, groupBy: string): ViewColumn[] {
  return columns.map((column) => ({
    key: column.key,
    label: columnLabel(column, t, groupBy),
    align: column.align,
    kind: column.kind,
  }));
}

function emptyText(column: ColumnDef, t: Translator): string {
  return column.nullLabelKey ? t(column.nullLabelKey) : NO_VALUE;
}

// Text shown on screen and in the PDF, in the user's language and number format.
export function displayCell(
  column: ColumnDef,
  cell: RawCell | undefined,
  t: Translator,
  locale: Locale,
): string {
  if (cell === null || cell === undefined) return emptyText(column, t);
  const intl = formatLocale(locale);
  if (isMoney(cell))
    return formatMoney({ amountMinor: cell.amountMinor, currency: cell.currency as Currency }, intl);
  switch (column.kind) {
    case "date":
      return formatDate(String(cell), intl);
    case "count":
      return formatNumber(Number(cell), intl);
    case "hours":
      return formatNumber(Number(cell), intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case "label":
    case "stamp":
      return t(`${column.labelPrefix ?? "analytics.reports.values"}.${cell}`);
    default:
      return String(cell);
  }
}

export function viewRow(
  columns: ColumnDef[],
  row: RawRow,
  t: Translator,
  locale: Locale,
): Record<string, ViewCell> {
  const cells: Record<string, ViewCell> = {};
  for (const column of columns) {
    const text = displayCell(column, row[column.key], t, locale);
    const code = row[column.key];
    cells[column.key] =
      column.kind === "stamp" && typeof code === "string"
        ? { text, tone: STAMP_TONES[code] ?? "neutral" }
        : text;
  }
  return cells;
}

// CSV cells (spec F13 section 5): dates in the user's language, plain numbers with the language's
// decimal separator, and one currency column after the row's money columns.
export function csvHeader(columns: ColumnDef[], t: Translator, groupBy: string): string[] {
  const header = columns.map((column) => columnLabel(column, t, groupBy));
  return columns.some((column) => column.kind === "money")
    ? [...header, t("analytics.reports.csvCurrency")]
    : header;
}

// "2026-09-03" as the language writes it (03/09/2026; 09/03/2026 in en). Built by hand because
// a formatter per row is the slowest part of a 50,000-row export (PRD F13: 10 seconds).
function csvDate(date: string, locale: Locale): string {
  const [year = "", month = "", day = ""] = date.split("-");
  return locale === "en" ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
}

export function csvRow(columns: ColumnDef[], row: RawRow, t: Translator, locale: Locale): CsvCell[] {
  let currency = "";
  const cells = columns.map((column): CsvCell => {
    const cell = row[column.key];
    if (cell === null || cell === undefined) return column.nullLabelKey ? t(column.nullLabelKey) : "";
    if (isMoney(cell)) {
      currency ||= cell.currency;
      return csvAmount(cell.amountMinor, cell.currency as Currency, locale);
    }
    if (column.kind === "hours") {
      return String(cell).replace(".", locale === "en" ? "." : ",");
    }
    if (column.kind === "date") return csvDate(String(cell), locale);
    if (column.kind === "label" || column.kind === "stamp")
      return t(`${column.labelPrefix ?? "analytics.reports.values"}.${cell}`);
    return typeof cell === "number" ? cell : String(cell);
  });
  return columns.some((column) => column.kind === "money") ? [...cells, currency] : cells;
}

// Which totals feed which column of the totals row (design system 5.4: the ledger row).
const TOTAL_COLUMNS: Record<ReportId, Record<string, { money?: string; count?: string }>> = {
  appointments: { price: { money: "price" } },
  cancellations: {},
  revenue: { amount: { money: "net" } },
  receivables: { amount: { money: "amount" }, balance: { money: "balance" } },
  productivity: {
    completed: { count: "completed" },
    noShows: { count: "noShows" },
    cancelled: { count: "cancelled" },
    billed: { money: "billed" },
    received: { money: "received" },
  },
};

// One line per currency inside a cell, never summed across currencies (ADR-029).
export function totalsRow(
  report: ReportId,
  columns: ColumnDef[],
  totals: Totals,
  t: Translator,
  locale: Locale,
): Record<string, string[]> {
  const intl = formatLocale(locale);
  const mapping = TOTAL_COLUMNS[report];
  const row: Record<string, string[]> = {};
  columns.forEach((column, index) => {
    const source = mapping[column.key];
    if (index === 0) {
      row[column.key] = [t("analytics.reports.totalRows", { count: totals.rowCount })];
    } else if (source?.money) {
      row[column.key] = (totals.money[source.money] ?? []).map((money) =>
        formatMoney({ amountMinor: money.amountMinor, currency: money.currency as Currency }, intl),
      );
    } else if (source?.count) {
      row[column.key] = [formatNumber(totals.counts[source.count] ?? 0, intl)];
    } else {
      row[column.key] = [];
    }
  });
  return row;
}
