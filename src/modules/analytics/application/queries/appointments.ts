import type { UnitOfWork } from "@/shared/db/transaction";
import type { OccupancyRange } from "../../domain/occupancy";
import type { QueryScope } from "./scope";

export type AppointmentCounts = {
  // Every appointment in the period, cancelled ones included (the base of the cancellation rate).
  booked: number;
  cancelled: number;
  completed: number;
  noShow: number;
  completedByCurrency: Map<string, number>;
};

type CountRow = { status: string; currency: string; total: number };

// PRD F12: appointments by status in the period, assigned by their start in the unit's local date.
export async function countAppointments(uow: UnitOfWork, scope: QueryScope): Promise<AppointmentCounts> {
  const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = scope;
  const rows = await uow.tx.$queryRaw<CountRow[]>`
    SELECT a.status, a.currency, count(*)::int AS total
    FROM appointment a
    JOIN unit u ON u.id = a.unit_id
    WHERE a.organization_id = ${organizationId}::uuid
      AND a.unit_id = ANY(${unitIds}::uuid[])
      AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId}::uuid)
      AND a.starts_at >= ${windowStart} AND a.starts_at < ${windowEnd}
      AND (a.starts_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date
    GROUP BY a.status, a.currency`;

  const counts: AppointmentCounts = {
    booked: 0,
    cancelled: 0,
    completed: 0,
    noShow: 0,
    completedByCurrency: new Map(),
  };
  for (const row of rows) {
    counts.booked += row.total;
    if (row.status === "CANCELLED") counts.cancelled += row.total;
    if (row.status === "NO_SHOW") counts.noShow += row.total;
    if (row.status === "COMPLETED") {
      counts.completed += row.total;
      counts.completedByCurrency.set(
        row.currency,
        (counts.completedByCurrency.get(row.currency) ?? 0) + row.total,
      );
    }
  }
  return counts;
}

type RangeRow = { professional_id: string; starts_at: Date; ends_at: Date };

// Ranges of the non-cancelled appointments of the period, for the occupancy (spec F12 decision D2).
export async function bookedRanges(uow: UnitOfWork, scope: QueryScope): Promise<OccupancyRange[]> {
  const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = scope;
  const rows = await uow.tx.$queryRaw<RangeRow[]>`
    SELECT a.professional_id, a.starts_at, a.ends_at
    FROM appointment a
    JOIN unit u ON u.id = a.unit_id
    WHERE a.organization_id = ${organizationId}::uuid
      AND a.unit_id = ANY(${unitIds}::uuid[])
      AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId}::uuid)
      AND a.status <> 'CANCELLED'
      AND a.starts_at >= ${windowStart} AND a.starts_at < ${windowEnd}
      AND (a.starts_at AT TIME ZONE u.time_zone)::date BETWEEN ${period.from}::date AND ${period.to}::date`;
  return rows.map((row) => ({
    professionalId: row.professional_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
}
