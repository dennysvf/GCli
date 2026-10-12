import type { ReportId } from "../application/reports/types";
import { PERIOD_PRESETS, type PeriodPreset } from "../domain/period";

// Client-safe description of the filters of each report (spec F13 section 5). The values mirror the
// schemas in application/reports/schemas.ts, which stay the source of truth for validation.
export type ReportFilterState = {
  period: PeriodPreset;
  from: string;
  to: string;
  unit: string;
  professional: string;
  service: string;
  status: string;
  type: string;
  origin: string;
  reason: string;
  groupBy: string;
  method: string;
  bucket: string;
};

export type ExtraFilter =
  "service" | "status" | "type" | "origin" | "reason" | "groupBy" | "method" | "bucket";

export const REPORT_EXTRA_FILTERS: Record<ReportId, ExtraFilter[]> = {
  appointments: ["service", "status"],
  cancellations: ["service", "type", "origin", "reason"],
  revenue: ["groupBy", "method", "service"],
  receivables: ["origin", "bucket"],
  productivity: [],
};

export const STATUS_OPTIONS = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
] as const;
export const TYPE_OPTIONS = ["CANCELLED", "NO_SHOW"] as const;
export const CANCELLATION_ORIGIN_OPTIONS = ["PATIENT", "CLINIC", "PROFESSIONAL"] as const;
export const CHARGE_ORIGIN_OPTIONS = ["APPOINTMENT", "PACKAGE", "MANUAL"] as const;
export const GROUP_BY_OPTIONS = ["METHOD", "SERVICE", "PROFESSIONAL", "UNIT"] as const;
export const BUCKET_OPTIONS = ["D0_30", "D31_60", "D61_90", "D90_PLUS"] as const;
export const METHOD_OPTIONS = [
  "CASH",
  "PIX",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "TRANSFER",
  "CHECK",
  "BIZUM",
  "MBWAY",
  "MULTIBANCO",
  "NEQUI",
  "PSE",
  "SPEI",
  "ZELLE",
  "MERCADO_PAGO",
  "OTHER",
] as const;

export function defaultFilters(today: string, report: ReportId): ReportFilterState {
  const base: ReportFilterState = {
    period: "CURRENT_MONTH",
    from: "",
    to: "",
    unit: "ALL",
    professional: "ALL",
    service: "ALL",
    status: "ALL",
    type: "ALL",
    origin: "ALL",
    reason: "ALL",
    groupBy: "METHOD",
    method: "ALL",
    bucket: "ALL",
  };
  // Open charges are older than the current month: spec F13, assumption 3.
  if (report === "receivables") {
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 365);
    return { ...base, period: "CUSTOM", from: start.toISOString().slice(0, 10), to: today };
  }
  return base;
}

export function isPeriodPreset(value: string): value is PeriodPreset {
  return (PERIOD_PRESETS as readonly string[]).includes(value);
}

// The input of the Server Action and the query of the export, for the filters the report uses.
export function toInput(report: ReportId, filters: ReportFilterState, page?: number): Record<string, string> {
  const input: Record<string, string> = {
    period: filters.period,
    unit: filters.unit,
    professional: filters.professional,
  };
  if (filters.period === "CUSTOM") {
    input.from = filters.from;
    input.to = filters.to;
  }
  for (const name of REPORT_EXTRA_FILTERS[report]) input[name] = filters[name];
  if (page && page > 1) input.page = String(page);
  return input;
}
