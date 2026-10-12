// Client entry point of the analytics module (ADR-027): only client-safe UI and types, for Client
// Components of the app layer. Server code goes through ./index.ts.
export { DashboardView } from "./ui/dashboard-view";
export type { DashboardAction } from "./ui/dashboard-view";
export type { FilterOption, FilterState } from "./ui/dashboard-filters";
export { ReportView } from "./ui/report-view";
export type { ReportAction } from "./ui/report-view";
export { ReportsIndex } from "./ui/reports-index";
export { defaultFilters, isPeriodPreset } from "./ui/report-options";
export type { ReportFilterState } from "./ui/report-options";
