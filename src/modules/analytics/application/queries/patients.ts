import type { UnitOfWork } from "@/shared/db/transaction";
import type { DateRange } from "../../domain/period";

export type NewPatientsScope = {
  organizationId: string;
  period: DateRange;
  // Patients have no unit: their registration date is taken in the organization's zone.
  timeZone: string;
  windowStart: Date;
  windowEnd: Date;
  // Null when the dashboard covers all units and all professionals.
  restrict: { unitIds: string[] | null; professionalId: string | null } | null;
};

// PRD F12 "Novos pacientes" (spec F12, assumption 3). With a unit or professional selected, only
// the patients whose first non-cancelled appointment is in that unit or with that professional count.
export async function countNewPatients(uow: UnitOfWork, scope: NewPatientsScope): Promise<number> {
  const { organizationId, period, timeZone, windowStart, windowEnd, restrict } = scope;
  if (!restrict) {
    const rows = await uow.tx.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
      FROM patient p
      WHERE p.organization_id = ${organizationId}::uuid
        AND p.created_at >= ${windowStart} AND p.created_at < ${windowEnd}
        AND (p.created_at AT TIME ZONE ${timeZone})::date BETWEEN ${period.from}::date AND ${period.to}::date`;
    return rows[0]?.total ?? 0;
  }
  const unitIds = restrict.unitIds ?? [];
  const anyUnit = restrict.unitIds === null;
  const rows = await uow.tx.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM patient p
    JOIN LATERAL (
      SELECT a.unit_id, a.professional_id
      FROM appointment a
      WHERE a.organization_id = ${organizationId}::uuid
        AND a.patient_id = p.id
        AND a.status <> 'CANCELLED'
      ORDER BY a.starts_at
      LIMIT 1
    ) first ON true
    WHERE p.organization_id = ${organizationId}::uuid
      AND p.created_at >= ${windowStart} AND p.created_at < ${windowEnd}
      AND (p.created_at AT TIME ZONE ${timeZone})::date BETWEEN ${period.from}::date AND ${period.to}::date
      AND (${anyUnit} OR first.unit_id = ANY(${unitIds}::uuid[]))
      AND (${restrict.professionalId}::uuid IS NULL OR first.professional_id = ${restrict.professionalId}::uuid)`;
  return rows[0]?.total ?? 0;
}
