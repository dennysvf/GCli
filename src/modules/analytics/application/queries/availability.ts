import type { UnitOfWork } from "@/shared/db/transaction";
import type { OccupancyClosure, OccupancyInterval, OccupancyRange } from "../../domain/occupancy";
import type { QueryScope } from "./scope";

export type AvailabilityInputs = {
  intervals: OccupancyInterval[];
  timeOffs: OccupancyRange[];
  closures: OccupancyClosure[];
};

type IntervalRow = {
  professional_id: string;
  unit_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  valid_from: string;
  valid_until: string | null;
};
type TimeOffRow = { professional_id: string; starts_at: Date; ends_at: Date };
type ClosureRow = { unit_id: string; starts_on: string; ends_on: string };

// Working intervals of the schedules valid in the period, time-offs and unit closures (F04, F02),
// the inputs of the occupancy (spec F12 decision D2).
export async function availabilityInputs(uow: UnitOfWork, scope: QueryScope): Promise<AvailabilityInputs> {
  const { organizationId, unitIds, professionalId, period, windowStart, windowEnd } = scope;
  const [intervals, timeOffs, closures] = await Promise.all([
    uow.tx.$queryRaw<IntervalRow[]>`
      SELECT s.professional_id, i.unit_id, i.weekday, i.start_minute, i.end_minute,
             to_char(s.valid_from, 'YYYY-MM-DD') AS valid_from,
             to_char(s.valid_until, 'YYYY-MM-DD') AS valid_until
      FROM professional_working_interval i
      JOIN professional_schedule s ON s.id = i.schedule_id
      WHERE i.organization_id = ${organizationId}::uuid
        AND i.unit_id = ANY(${unitIds}::uuid[])
        AND (${professionalId}::uuid IS NULL OR s.professional_id = ${professionalId}::uuid)
        AND s.valid_from <= ${period.to}::date
        AND (s.valid_until IS NULL OR s.valid_until >= ${period.from}::date)`,
    uow.tx.$queryRaw<TimeOffRow[]>`
      SELECT professional_id, starts_at, ends_at
      FROM professional_time_off
      WHERE organization_id = ${organizationId}::uuid
        AND (${professionalId}::uuid IS NULL OR professional_id = ${professionalId}::uuid)
        AND starts_at < ${windowEnd} AND ends_at > ${windowStart}`,
    uow.tx.$queryRaw<ClosureRow[]>`
      SELECT unit_id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on
      FROM unit_closure
      WHERE organization_id = ${organizationId}::uuid
        AND unit_id = ANY(${unitIds}::uuid[])
        AND starts_on <= ${period.to}::date AND ends_on >= ${period.from}::date`,
  ]);
  return {
    intervals: intervals.map((row) => ({
      professionalId: row.professional_id,
      unitId: row.unit_id,
      weekday: row.weekday,
      startMinute: row.start_minute,
      endMinute: row.end_minute,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
    })),
    timeOffs: timeOffs.map((row) => ({
      professionalId: row.professional_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    })),
    closures: closures.map((row) => ({ unitId: row.unit_id, startsOn: row.starts_on, endsOn: row.ends_on })),
  };
}
