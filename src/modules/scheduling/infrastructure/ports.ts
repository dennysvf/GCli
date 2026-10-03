import type { PatientAppointments } from "@/modules/patients";
import type { ProfessionalAppointments } from "@/modules/professionals";
import type { ScheduledServiceAppointments } from "@/modules/services";
import type { ScheduledAppointments } from "@/modules/units";
import { forTenant } from "@/shared/db/tenant";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import { localMinuteToUtc } from "@/shared/kernel/zoned-time";
import { localSpan } from "../domain/agenda-time";

// Implementations of the appointment ports that F02, F03, F04 and F05 declared with inert
// defaults (ADR-007, ADR-022), registered by src/composition.ts. "Future" means starting after
// `now` and still open (Agendado or Confirmado), as those features defined it.

const OPEN = ["SCHEDULED", "CONFIRMED"];

function future(now: Date) {
  return { startsAt: { gt: now }, status: { in: OPEN } };
}

export const unitsAppointments: ScheduledAppointments = {
  countFutureInRoom: (organizationId, roomId, now) =>
    forTenant(organizationId).appointment.count({ where: { roomId, ...future(now) } }),

  countFutureInUnit: (organizationId, unitId, now) =>
    forTenant(organizationId).appointment.count({ where: { unitId, ...future(now) } }),

  // Any appointment at all, in any status: the country of the unit is locked afterwards (PRD F16).
  hasAnyInUnit: async (organizationId, unitId) =>
    (await forTenant(organizationId).appointment.count({ where: { unitId }, take: 1 })) > 0,

  countInDateRange: (organizationId, unitId, startsOn, endsOn, timeZone) =>
    forTenant(organizationId).appointment.count({
      where: {
        unitId,
        startsAt: {
          gte: localMinuteToUtc(startsOn, 0, timeZone),
          lt: localMinuteToUtc(endsOn, 1440, timeZone),
        },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
    }),

  async countFutureOutsideHours(organizationId, unitId, week, now, timeZone) {
    const rows = await forTenant(organizationId).appointment.findMany({
      where: { unitId, ...future(now) },
      select: { startsAt: true, durationMinutes: true },
    });
    const hours = new Map(week.map((day) => [day.weekday, day.open ? day.intervals : []]));
    return rows.filter((row) => {
      const span = localSpan(DateTimeRange.ofMinutes(row.startsAt, row.durationMinutes), timeZone);
      return !(hours.get(span.weekday) ?? []).some(
        (interval) => interval.start <= span.start && span.end <= interval.end,
      );
    }).length;
  },
};

export const servicesAppointments: ScheduledServiceAppointments = {
  countFuture: (organizationId, serviceId, now) =>
    forTenant(organizationId).appointment.count({ where: { serviceId, ...future(now) } }),
};

export const professionalsAppointments: ProfessionalAppointments = {
  countFuture: (organizationId, professionalId, now) =>
    forTenant(organizationId).appointment.count({ where: { professionalId, ...future(now) } }),

  countFutureForServices: (organizationId, professionalId, serviceIds, now) =>
    serviceIds.length === 0
      ? Promise.resolve(0)
      : forTenant(organizationId).appointment.count({
          where: { professionalId, serviceId: { in: serviceIds }, ...future(now) },
        }),

  // The F04 time-off notice lists names; the port carries only the organization, so the names
  // are read through the appointment's relations (read-only, display only).
  async listInPeriod(organizationId, professionalId, startsAt, endsAt) {
    const rows = await forTenant(organizationId).appointment.findMany({
      where: { professionalId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, status: { in: OPEN } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        unit: { select: { name: true } },
        service: { select: { name: true } },
        patient: { select: { fullName: true, socialName: true } },
      },
    });
    return rows.map((row) => ({
      appointmentId: row.id,
      startsAt: row.startsAt.toISOString(),
      unitName: row.unit.name,
      serviceName: row.service.name,
      patientName: row.patient.socialName?.trim() || row.patient.fullName,
    }));
  },
};

export const patientsAppointments: PatientAppointments = {
  countFuture: (organizationId, patientId, now) =>
    forTenant(organizationId).appointment.count({ where: { patientId, ...future(now) } }),

  async lastAppointmentDates(organizationId, patientIds) {
    if (patientIds.length === 0) return new Map();
    const rows = await forTenant(organizationId).appointment.groupBy({
      by: ["patientId"],
      where: { patientId: { in: patientIds }, status: { not: "CANCELLED" } },
      _max: { startsAt: true },
    });
    return new Map(
      rows.flatMap((row) => (row._max.startsAt ? [[row.patientId, row._max.startsAt.toISOString()]] : [])),
    );
  },

  // Spec F06: any appointment except cancelled ones links a professional to a patient.
  async hasAppointmentWith(organizationId, professionalId, patientId) {
    const row = await forTenant(organizationId).appointment.findFirst({
      where: { professionalId, patientId, status: { not: "CANCELLED" } },
      select: { id: true },
    });
    return row !== null;
  },

  async patientIdsFor(organizationId, professionalId) {
    const rows = await forTenant(organizationId).appointment.findMany({
      where: { professionalId, status: { not: "CANCELLED" } },
      distinct: ["patientId"],
      select: { patientId: true },
    });
    return rows.map((row) => row.patientId);
  },
};
