import { forTenant } from "@/shared/db/tenant";

// Reads that clinical-records (F07) needs from appointments. They take the organization instead of
// a request context and apply no own-agenda filter, because the clinical access policy decides who
// may see the patient (spec F07 section 5). They read only what a note needs, never prices or notes.

export type AppointmentForRecord = {
  id: string;
  patientId: string;
  professionalId: string;
  serviceId: string;
  serviceName: string;
  unitId: string;
  unitTimeZone: string;
  startsAt: string;
  status: string;
};

export async function getAppointmentForRecord(
  organizationId: string,
  appointmentId: string,
): Promise<AppointmentForRecord | null> {
  const row = await forTenant(organizationId).appointment.findFirst({
    where: { id: appointmentId },
    select: {
      id: true,
      patientId: true,
      professionalId: true,
      serviceId: true,
      unitId: true,
      startsAt: true,
      status: true,
      service: { select: { name: true } },
      unit: { select: { timeZone: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    patientId: row.patientId,
    professionalId: row.professionalId,
    serviceId: row.serviceId,
    serviceName: row.service.name,
    unitId: row.unitId,
    unitTimeZone: row.unit.timeZone,
    startsAt: row.startsAt.toISOString(),
    status: row.status,
  };
}

// PRD F07: a professional reads a patient's records with at least one appointment with them (any
// status but cancelled, like F05 visibility); standalone notes need a past appointment the patient
// attended (spec F07 section 3).
export async function professionalPatientRelation(
  organizationId: string,
  professionalId: string,
  patientId: string,
  now: Date,
): Promise<{ hasAnyAppointment: boolean; hasAttendedPastAppointment: boolean }> {
  const client = forTenant(organizationId);
  const [any, attended] = await Promise.all([
    client.appointment.findFirst({
      where: { professionalId, patientId, status: { not: "CANCELLED" } },
      select: { id: true },
    }),
    client.appointment.findFirst({
      where: {
        professionalId,
        patientId,
        startsAt: { lt: now },
        status: { in: ["CHECKED_IN", "IN_PROGRESS", "COMPLETED"] },
      },
      select: { id: true },
    }),
  ]);
  return { hasAnyAppointment: any !== null, hasAttendedPastAppointment: attended !== null };
}

export type AppointmentForList = {
  startsAt: string;
  serviceName: string;
  professionalId: string;
  unitTimeZone: string;
};

export async function appointmentsForRecords(
  organizationId: string,
  appointmentIds: string[],
): Promise<Map<string, AppointmentForList>> {
  if (appointmentIds.length === 0) return new Map();
  const rows = await forTenant(organizationId).appointment.findMany({
    where: { id: { in: appointmentIds } },
    select: {
      id: true,
      startsAt: true,
      professionalId: true,
      service: { select: { name: true } },
      unit: { select: { timeZone: true } },
    },
  });
  return new Map(
    rows.map((row) => [
      row.id,
      {
        startsAt: row.startsAt.toISOString(),
        serviceName: row.service.name,
        professionalId: row.professionalId,
        unitTimeZone: row.unit.timeZone,
      },
    ]),
  );
}
