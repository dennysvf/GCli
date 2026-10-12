import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { AnalyticsErrors } from "../domain/errors";
import {
  averageTicket,
  moneyLines,
  percentChange,
  pointsChange,
  ratio,
  result,
  type Polarity,
} from "../domain/kpis";
import { MAX_DASHBOARD_DAYS } from "../domain/limits";
import { computeOccupancy, type Occupancy } from "../domain/occupancy";
import { periodDays, previousPeriod, resolvePeriod, type DateRange } from "../domain/period";
import type { TtlCache } from "./cache";
import { bookedRanges, countAppointments, type AppointmentCounts } from "./queries/appointments";
import { availabilityInputs } from "./queries/availability";
import { cashTotals } from "./queries/cash";
import { chargeTotals } from "./queries/charges";
import { countNewPatients } from "./queries/patients";
import { loadDirectory, utcWindow, type QueryScope, type UnitRow } from "./queries/scope";
import { dashboardFiltersSchema } from "./schemas";
import type { CountKpi, DashboardView, MoneyKpi, RateKpi } from "./views";

// The figures of one period and filter combination, as cached (ADR-037).
export type DashboardFigures = {
  counts: AppointmentCounts;
  occupancy: Occupancy;
  newPatients: number;
  billed: Map<string, bigint>;
  receivable: Map<string, bigint>;
  received: Map<string, bigint>;
  // Null with a professional selected (spec F12 decision D4).
  cash: { revenues: Map<string, bigint>; expenses: Map<string, bigint> } | null;
  computedAt: Date;
};

export type AnalyticsDeps = {
  clock: () => Date;
  cache: TtlCache<DashboardFigures>;
};

type Selection = {
  organizationId: string;
  units: UnitRow[];
  allUnits: boolean;
  professionalId: string | null;
  organizationZone: string;
};

async function computeFigures(ctx: RequestContext, selection: Selection, period: DateRange, now: Date) {
  const zones = [...new Set([selection.organizationZone, ...selection.units.map((unit) => unit.time_zone)])];
  const scope: QueryScope = {
    organizationId: selection.organizationId,
    unitIds: selection.units.map((unit) => unit.id),
    professionalId: selection.professionalId,
    period,
    ...utcWindow(period, zones),
  };
  const restricted = !selection.allUnits || selection.professionalId !== null;
  return withTransaction(ctx, async (uow) => {
    const [counts, ranges, availability, charges, cash, newPatients] = await Promise.all([
      countAppointments(uow, scope),
      bookedRanges(uow, scope),
      availabilityInputs(uow, scope),
      chargeTotals(uow, scope),
      selection.professionalId === null ? cashTotals(uow, scope, selection.allUnits) : Promise.resolve(null),
      countNewPatients(uow, {
        organizationId: scope.organizationId,
        period,
        timeZone: selection.organizationZone,
        windowStart: scope.windowStart,
        windowEnd: scope.windowEnd,
        restrict: restricted
          ? { unitIds: selection.allUnits ? null : scope.unitIds, professionalId: selection.professionalId }
          : null,
      }),
    ]);
    const occupancy = computeOccupancy({
      period,
      unitZones: new Map(selection.units.map((unit) => [unit.id, unit.time_zone])),
      ...availability,
      appointments: ranges,
    });
    const figures: DashboardFigures = {
      counts,
      occupancy,
      newPatients,
      ...charges,
      cash,
      computedAt: now,
    };
    return ok(figures);
  });
}

function countKpi(value: number, previous: number): CountKpi {
  return { value, previous, change: percentChange(value, previous, "HIGHER_IS_BETTER") };
}

function rateKpi(
  numerator: number,
  denominator: number,
  previous: number | null,
  polarity: Polarity,
): RateKpi {
  const value = ratio(numerator, denominator);
  return { numerator, denominator, value, previous, change: pointsChange(value, previous, polarity) };
}

function moneyKpi(current: Map<string, bigint>, previous: Map<string, bigint>, polarity: Polarity): MoneyKpi {
  return {
    lines: moneyLines(current, previous, polarity).map((line) => ({
      ...line,
      amountMinor: line.amountMinor.toString(),
      previousMinor: line.previousMinor.toString(),
    })),
  };
}

const cancellationOf = (counts: AppointmentCounts) => ratio(counts.cancelled, counts.booked);
const noShowOf = (counts: AppointmentCounts) => ratio(counts.noShow, counts.completed + counts.noShow);
const occupancyOf = (occupancy: Occupancy) => ratio(occupancy.bookedMinutes, occupancy.availableMinutes);

function isEmpty(figures: DashboardFigures): boolean {
  const money = [figures.billed, figures.received, figures.cash?.revenues, figures.cash?.expenses];
  return (
    figures.counts.booked === 0 && figures.newPatients === 0 && money.every((map) => !map || map.size === 0)
  );
}

function buildView(
  current: DashboardFigures,
  previous: DashboardFigures,
  periods: { period: DateRange; previousPeriod: DateRange; timeZone: string },
): DashboardView {
  const { counts, occupancy } = current;
  const ticket = averageTicket(current.received, counts.completedByCurrency);
  const previousTicket = averageTicket(previous.received, previous.counts.completedByCurrency);
  const cash = current.cash;
  const previousCash = previous.cash;
  return {
    ...periods,
    computedAt: current.computedAt.toISOString(),
    isEmpty: isEmpty(current),
    professionalSelected: cash === null,
    operations: {
      appointments: countKpi(
        counts.booked - counts.cancelled,
        previous.counts.booked - previous.counts.cancelled,
      ),
      completed: countKpi(counts.completed, previous.counts.completed),
      occupancy: rateKpi(
        occupancy.bookedMinutes,
        occupancy.availableMinutes,
        occupancyOf(previous.occupancy),
        "HIGHER_IS_BETTER",
      ),
      cancellationRate: rateKpi(
        counts.cancelled,
        counts.booked,
        cancellationOf(previous.counts),
        "LOWER_IS_BETTER",
      ),
      noShowRate: rateKpi(
        counts.noShow,
        counts.completed + counts.noShow,
        noShowOf(previous.counts),
        "LOWER_IS_BETTER",
      ),
      newPatients: countKpi(current.newPatients, previous.newPatients),
    },
    finance: {
      billed: moneyKpi(current.billed, previous.billed, "HIGHER_IS_BETTER"),
      received: moneyKpi(current.received, previous.received, "HIGHER_IS_BETTER"),
      receivable: moneyKpi(current.receivable, previous.receivable, "NEUTRAL"),
      averageTicket: moneyKpi(ticket, previousTicket, "HIGHER_IS_BETTER"),
      paidExpenses:
        cash && previousCash ? moneyKpi(cash.expenses, previousCash.expenses, "LOWER_IS_BETTER") : null,
      result:
        cash && previousCash
          ? moneyKpi(
              result(current.received, cash.revenues, cash.expenses),
              result(previous.received, previousCash.revenues, previousCash.expenses),
              "HIGHER_IS_BETTER",
            )
          : null,
    },
  };
}

// PRD F12: the management dashboard for a period, a unit and a professional, compared with the
// previous equivalent period. Authorization always runs before the cache (ADR-037).
export async function getDashboard(
  deps: AnalyticsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<DashboardView>> {
  const allowed = await authorize(ctx, "dashboard:read");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(dashboardFiltersSchema, input);
  if (!parsed.ok) return parsed;
  const filters = parsed.value;
  const professionalId = filters.professional === "ALL" ? null : filters.professional;

  const directory = await withTransaction(ctx, async (uow) =>
    ok(await loadDirectory(uow, ctx.organizationId, professionalId)),
  );
  if (!directory.ok) return directory;
  const { units, organizationZone, professionalExists } = directory.value;
  const chosen = filters.unit === "ALL" ? units : units.filter((unit) => unit.id === filters.unit);
  if (filters.unit !== "ALL" && chosen.length === 0) return fail(AnalyticsErrors.unitInvalid());
  if (!professionalExists) return fail(AnalyticsErrors.professionalInvalid());

  // Spec F12, assumption 2: presets use "today" in the selected unit's zone, else the organization's.
  const timeZone = filters.unit === "ALL" ? organizationZone : (chosen[0]?.time_zone ?? organizationZone);
  const now = deps.clock();
  const custom = filters.from && filters.to ? { from: filters.from, to: filters.to } : undefined;
  const period = resolvePeriod(filters.period, dateInTimeZone(now, timeZone), custom);
  if (period.to < period.from) return fail(AnalyticsErrors.periodInvalid());
  if (periodDays(period) > MAX_DASHBOARD_DAYS) return fail(AnalyticsErrors.periodTooLong());
  const previous = previousPeriod(period, filters.period);

  const selection: Selection = {
    organizationId: ctx.organizationId,
    units: chosen,
    allUnits: filters.unit === "ALL",
    professionalId,
    organizationZone,
  };
  const figuresFor = async (range: DateRange): Promise<Result<DashboardFigures>> => {
    const key = [ctx.organizationId, filters.unit, filters.professional, range.from, range.to].join("|");
    const cached = deps.cache.get(key);
    if (cached) return ok(cached);
    const computed = await computeFigures(ctx, selection, range, now);
    if (computed.ok) deps.cache.set(key, computed.value);
    return computed;
  };
  const [current, before] = await Promise.all([figuresFor(period), figuresFor(previous)]);
  if (!current.ok) return current;
  if (!before.ok) return before;
  return ok(buildView(current.value, before.value, { period, previousPeriod: previous, timeZone }));
}
