// Public API of the analytics module (spec F12 section 5). Read-only: it never writes to the tables
// of other modules (ADR-037). Callers never import files inside the module.
import type { RequestContext } from "@/shared/context/types";
import { createTtlCache } from "./application/cache";
import { getDashboard, type AnalyticsDeps, type DashboardFigures } from "./application/get-dashboard";

const clock = () => new Date();
const baseDeps: AnalyticsDeps = { clock, cache: createTtlCache<DashboardFigures>({ clock }) };

// The use cases bound to their dependencies. `adjust` lets tests replace the clock or the cache.
export function createAnalytics(adjust?: (base: AnalyticsDeps) => AnalyticsDeps) {
  const deps = adjust ? adjust(baseDeps) : baseDeps;
  return {
    getDashboard: (ctx: RequestContext, input: unknown) => getDashboard(deps, ctx, input),
  };
}

export const analytics = createAnalytics();

export { createTtlCache } from "./application/cache";
export type { TtlCache } from "./application/cache";
export type { AnalyticsDeps, DashboardFigures } from "./application/get-dashboard";
export type { DashboardFilters } from "./application/schemas";
export type { CountKpi, DashboardView, MoneyKpi, MoneyKpiLine, RateKpi } from "./application/views";
export type { Change, ChangeKind, Tone } from "./domain/kpis";
export { PERIOD_PRESETS, type PeriodPreset } from "./domain/period";
export { analyticsCatalog } from "./messages/catalog";
