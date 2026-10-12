import type { Change } from "../domain/kpis";
import type { DateRange } from "../domain/period";

// The dashboard as the screen receives it (spec F12 section 5). Money crosses the client boundary
// as decimal strings of minor units, because BigInt has no JSON form.
export type CountKpi = { value: number; previous: number; change: Change };
export type RateKpi = {
  numerator: number;
  denominator: number;
  value: number | null;
  previous: number | null;
  change: Change;
};
export type MoneyKpiLine = { currency: string; amountMinor: string; previousMinor: string; change: Change };
export type MoneyKpi = { lines: MoneyKpiLine[] };

export type DashboardView = {
  period: DateRange;
  previousPeriod: DateRange;
  computedAt: string;
  timeZone: string;
  isEmpty: boolean;
  professionalSelected: boolean;
  operations: {
    appointments: CountKpi;
    completed: CountKpi;
    occupancy: RateKpi;
    cancellationRate: RateKpi;
    noShowRate: RateKpi;
    newPatients: CountKpi;
  };
  finance: {
    billed: MoneyKpi;
    received: MoneyKpi;
    receivable: MoneyKpi;
    averageTicket: MoneyKpi;
    paidExpenses: MoneyKpi | null;
    result: MoneyKpi | null;
  };
};
