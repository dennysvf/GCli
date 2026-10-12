// Client entry point of the analytics module (ADR-027): only client-safe UI and types, for Client
// Components of the app layer. Server code goes through ./index.ts.
export { DashboardView } from "./ui/dashboard-view";
export type { DashboardAction } from "./ui/dashboard-view";
export type { FilterOption, FilterState } from "./ui/dashboard-filters";
