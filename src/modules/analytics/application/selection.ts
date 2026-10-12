import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { AnalyticsErrors } from "../domain/errors";
import { MAX_REPORT_DAYS } from "../domain/limits";
import { periodDays, resolvePeriod, type DateRange, type PeriodPreset } from "../domain/period";
import { loadDirectory, utcWindow, type QueryScope, type UnitRow } from "./queries/scope";

export type SelectionFilters = {
  period: PeriodPreset;
  from?: string | undefined;
  to?: string | undefined;
  unit: string;
  professional: string;
};

export type ResolvedSelection = {
  scope: QueryScope;
  units: UnitRow[];
  organizationZone: string;
  timeZone: string;
};

// Units, zones and the period of a filter combination, as the dashboard resolves them (spec F13
// decision D11): presets use "today" in the selected unit's zone, else the organization's.
export async function resolveSelection(
  ctx: RequestContext,
  filters: SelectionFilters,
  now: Date,
  maxDays: number = MAX_REPORT_DAYS,
): Promise<Result<ResolvedSelection>> {
  const professionalId = filters.professional === "ALL" ? null : filters.professional;
  const directory = await withTransaction(ctx, async (uow) =>
    ok(await loadDirectory(uow, ctx.organizationId, professionalId)),
  );
  if (!directory.ok) return directory;
  const { units, organizationZone, professionalExists } = directory.value;
  const chosen = filters.unit === "ALL" ? units : units.filter((unit) => unit.id === filters.unit);
  if (filters.unit !== "ALL" && chosen.length === 0) return fail(AnalyticsErrors.unitInvalid());
  if (!professionalExists) return fail(AnalyticsErrors.professionalInvalid());

  const timeZone = filters.unit === "ALL" ? organizationZone : (chosen[0]?.time_zone ?? organizationZone);
  const custom = filters.from && filters.to ? { from: filters.from, to: filters.to } : undefined;
  const period: DateRange = resolvePeriod(filters.period, dateInTimeZone(now, timeZone), custom);
  if (period.to < period.from) return fail(AnalyticsErrors.periodInvalid());
  if (periodDays(period) > maxDays) return fail(AnalyticsErrors.periodTooLong());

  const zones = [...new Set([organizationZone, ...chosen.map((unit) => unit.time_zone)])];
  return ok({
    scope: {
      organizationId: ctx.organizationId,
      unitIds: chosen.map((unit) => unit.id),
      professionalId,
      period,
      ...utcWindow(period, zones),
    },
    units: chosen,
    organizationZone,
    timeZone,
  });
}
