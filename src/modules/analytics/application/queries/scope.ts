import type { DateRange } from "../../domain/period";

// Filters shared by every dashboard query (spec F12 decision D8). Raw SQL is not scoped by the
// tenant extension, so every query filters organization_id explicitly. `windowStart`/`windowEnd`
// narrow the indexed scan to the UTC instants that can fall in the period in any of the units;
// each query then keeps the rows whose local date, in their unit's zone, is inside the period.
export type QueryScope = {
  organizationId: string;
  unitIds: string[];
  professionalId: string | null;
  period: DateRange;
  windowStart: Date;
  windowEnd: Date;
};

export type CurrencyRow = { currency: string; amount: bigint | null };

export function toAmounts(rows: CurrencyRow[]): Map<string, bigint> {
  const amounts = new Map<string, bigint>();
  for (const row of rows) amounts.set(row.currency, (amounts.get(row.currency) ?? 0n) + (row.amount ?? 0n));
  return amounts;
}
