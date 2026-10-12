import type { UnitOfWork } from "@/shared/db/transaction";
import { addDays } from "@/shared/kernel/calendar-date";
import { zonedTimeToUtc } from "@/shared/kernel/zoned-time";
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

export type UnitRow = { id: string; time_zone: string; country: string };
export type Directory = { units: UnitRow[]; organizationZone: string; professionalExists: boolean };

export async function loadDirectory(
  uow: UnitOfWork,
  organizationId: string,
  professionalId: string | null,
): Promise<Directory> {
  const [units, organization, professional] = await Promise.all([
    uow.tx.$queryRaw<UnitRow[]>`
      SELECT id, time_zone, country FROM unit WHERE organization_id = ${organizationId}::uuid ORDER BY name`,
    uow.tx.$queryRaw<{ time_zone: string }[]>`
      SELECT time_zone FROM organization WHERE id = ${organizationId}::uuid`,
    professionalId
      ? uow.tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM professional WHERE organization_id = ${organizationId}::uuid AND id = ${professionalId}::uuid`
      : Promise.resolve([]),
  ]);
  return {
    units,
    organizationZone: organization[0]?.time_zone ?? "America/Sao_Paulo",
    professionalExists: professionalId === null || professional.length > 0,
  };
}

// UTC instants that can belong to the period in any of the zones (spec F12 decision D8).
export function utcWindow(period: DateRange, zones: string[]): { windowStart: Date; windowEnd: Date } {
  const starts = zones.map((zone) => zonedTimeToUtc(`${period.from}T00:00`, zone).getTime());
  const ends = zones.map((zone) => zonedTimeToUtc(`${addDays(period.to, 1)}T00:00`, zone).getTime());
  return { windowStart: new Date(Math.min(...starts)), windowEnd: new Date(Math.max(...ends)) };
}
