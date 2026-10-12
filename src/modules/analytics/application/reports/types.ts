import type { UnitOfWork } from "@/shared/db/transaction";
import type { Locale } from "@/shared/i18n/locales";
import type { QueryScope } from "../queries/scope";

export const REPORT_IDS = [
  "appointments",
  "cancellations",
  "revenue",
  "receivables",
  "productivity",
] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export type Money = { amountMinor: bigint; currency: string };
export type RawCell = string | number | null | Money;
export type RawRow = Record<string, RawCell>;

// "label" and "stamp" cells hold a code that the catalog translates with `labelPrefix`.
export type ColumnKind = "text" | "date" | "time" | "count" | "hours" | "money" | "label" | "stamp";
export type ColumnDef = {
  key: string;
  kind: ColumnKind;
  align: "left" | "right";
  labelPrefix?: string;
  // Catalog key shown instead of an empty mark when the cell is empty (for example no reason).
  nullLabelKey?: string;
};

export type Totals = {
  rowCount: number;
  counts: Record<string, number>;
  // One list per metric, with a line per currency (ADR-029).
  money: Record<string, Money[]>;
};

export type Summary = { key: string; columns: ColumnDef[]; rows: RawRow[] };

// Filters of every report; each report reads only the fields that apply to it (spec F13 section 5).
export type ReportFilters = {
  page: number;
  service: string;
  status: string;
  type: string;
  origin: string;
  reason: string;
  groupBy: "METHOD" | "SERVICE" | "PROFESSIONAL" | "UNIT";
  method: string;
  bucket: string;
};

export type ReportContext = {
  scope: QueryScope;
  filters: ReportFilters;
  now: Date;
  // Country of each unit, to format phones.
  unitCountries: Map<string, string>;
};

// Keyset cursor of the export batches (spec F13 decision D5).
export type Cursor = { at: Date; id: string };

export type RowsOptions = { limit: number; offset?: number; after?: Cursor | null };
export type RowsResult = { rows: RawRow[]; cursor: Cursor | null };

export type ReportDefinition = {
  id: ReportId;
  columns: ColumnDef[];
  // Filters that reference other records, checked before the report runs.
  referencesService: boolean;
  referencesReason: boolean;
  totals(uow: UnitOfWork, rc: ReportContext): Promise<Totals>;
  summaries(uow: UnitOfWork, rc: ReportContext): Promise<Summary[]>;
  rows(uow: UnitOfWork, rc: ReportContext, options: RowsOptions): Promise<RowsResult>;
};

export type FormatContext = { locale: Locale };
