// Public API of the analytics module (spec F12 section 5). Read-only: it never writes to the tables
// of other modules (ADR-037). Callers never import files inside the module.
import type { RequestContext } from "@/shared/context/types";
import { createTtlCache } from "./application/cache";
import { exportReport, type ReportExportDeps, type ReportExportFormat } from "./application/export-report";
import { getDashboard, type AnalyticsDeps, type DashboardFigures } from "./application/get-dashboard";
import { getReport } from "./application/get-report";
import { identityOrganizationHeader } from "./infrastructure/organization-header";
import { reactPdfReportRenderer } from "./infrastructure/report-pdf";

const clock = () => new Date();
type Deps = AnalyticsDeps & ReportExportDeps;
const baseDeps: Deps = {
  clock,
  cache: createTtlCache<DashboardFigures>({ clock }),
  organizationHeader: identityOrganizationHeader,
  pdf: reactPdfReportRenderer,
};

// The use cases bound to their dependencies. `adjust` lets tests replace the clock, the cache or
// the PDF and header ports.
export function createAnalytics(adjust?: (base: Deps) => Deps) {
  const deps = adjust ? adjust(baseDeps) : baseDeps;
  return {
    getDashboard: (ctx: RequestContext, input: unknown) => getDashboard(deps, ctx, input),
    getReport: (ctx: RequestContext, report: string, input: unknown) => getReport(deps, ctx, report, input),
    exportReport: (ctx: RequestContext, report: string, format: ReportExportFormat, input: unknown) =>
      exportReport(deps, ctx, report, format, input),
  };
}

export const analytics = createAnalytics();

export { createTtlCache } from "./application/cache";
export type { TtlCache } from "./application/cache";
export type { AnalyticsDeps, DashboardFigures } from "./application/get-dashboard";
export type { DashboardFilters } from "./application/schemas";
export type { CountKpi, DashboardView, MoneyKpi, MoneyKpiLine, RateKpi } from "./application/views";
export type { Change, ChangeKind, Tone } from "./domain/kpis";
export type {
  OrganizationHeader,
  OrganizationHeaderLookup,
  ReportPdfDocument,
  ReportPdfRenderer,
} from "./application/ports";
export type { ReportExport, ReportExportFormat } from "./application/export-report";
export type { ReportSummaryView, ReportView } from "./application/get-report";
export { REPORT_IDS, type ReportId } from "./application/reports/types";
export { isReportId } from "./application/reports/registry";
export type { ViewCell, ViewColumn } from "./application/reports/format";
export { agingBucket, daysOpen, type AgingBucketId } from "./domain/aging";
export { PERIOD_PRESETS, type PeriodPreset } from "./domain/period";
export { analyticsCatalog } from "./messages/catalog";
