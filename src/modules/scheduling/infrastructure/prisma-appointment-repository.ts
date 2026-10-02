import type { Prisma } from "@/generated/prisma/client";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import { newId } from "@/shared/kernel/ids";
import type {
  AppointmentFilter,
  AppointmentRecord,
  AppointmentRepository,
  RescheduleHistoryRow,
  SaveOutcome,
  StatusHistoryRow,
} from "../application/ports";
import { Appointment, type AppointmentProps, type CancellationOrigin } from "../domain/appointment";
import type { AppointmentStatus } from "../domain/status";

type Row = Prisma.AppointmentGetPayload<object>;

function propsOf(row: Row): AppointmentProps {
  return {
    id: row.id,
    unitId: row.unitId,
    professionalId: row.professionalId,
    serviceId: row.serviceId,
    patientId: row.patientId,
    roomId: row.roomId,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    priceCents: row.priceCents,
    status: row.status as AppointmentStatus,
    statusChangedAt: row.statusChangedAt,
    isOverbooking: row.isOverbooking,
    exceptionJustification: row.exceptionJustification,
    exceptionCodes: row.exceptionCodes,
    notes: row.notes,
    seriesId: row.seriesId,
    seriesIndex: row.seriesIndex,
    cancellation:
      row.cancellationOrigin && row.cancellationReasonId && row.cancelledAt
        ? {
            origin: row.cancellationOrigin as CancellationOrigin,
            reasonId: row.cancellationReasonId,
            note: row.cancellationNote,
            cancelledAt: row.cancelledAt,
          }
        : null,
    version: row.version,
  };
}

function recordOf(row: Row): AppointmentRecord {
  return {
    ...propsOf(row),
    createdById: row.createdById,
    updatedById: row.updatedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function columnsOf(props: Readonly<AppointmentProps>) {
  return {
    unitId: props.unitId,
    professionalId: props.professionalId,
    serviceId: props.serviceId,
    patientId: props.patientId,
    roomId: props.roomId,
    startsAt: props.startsAt,
    endsAt: new Date(props.startsAt.getTime() + props.durationMinutes * 60_000),
    durationMinutes: props.durationMinutes,
    priceCents: props.priceCents,
    status: props.status,
    statusChangedAt: props.statusChangedAt,
    isOverbooking: props.isOverbooking,
    exceptionJustification: props.exceptionJustification,
    exceptionCodes: props.exceptionCodes,
    notes: props.notes,
    seriesId: props.seriesId,
    seriesIndex: props.seriesIndex,
    cancellationOrigin: props.cancellation?.origin ?? null,
    cancellationReasonId: props.cancellation?.reasonId ?? null,
    cancellationNote: props.cancellation?.note ?? null,
    cancelledAt: props.cancellation?.cancelledAt ?? null,
  };
}

// PostgreSQL reports a violated exclusion constraint as SQLSTATE 23P01; the driver adapter wraps
// it, so the code and the constraint name are searched in the whole error chain.
export function isExclusionViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (value: unknown): boolean => {
    if (value === null || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ["code", "originalCode", "message", "constraint"]) {
      const field = record[key];
      if (
        typeof field === "string" &&
        (field === "23P01" || /exclusion constraint|ex_appointment_/.test(field))
      ) {
        return true;
      }
    }
    return ["cause", "meta", "error"].some((key) => visit(record[key]));
  };
  return visit(error);
}

function filterWhere(filter: AppointmentFilter): Prisma.AppointmentWhereInput {
  return {
    ...(filter.unitId ? { unitId: filter.unitId } : {}),
    ...(filter.professionalIds ? { professionalId: { in: filter.professionalIds } } : {}),
    ...(filter.roomIds ? { roomId: { in: filter.roomIds } } : {}),
    ...(filter.serviceIds ? { serviceId: { in: filter.serviceIds } } : {}),
    ...(filter.patientId ? { patientId: filter.patientId } : {}),
    ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
    ...(filter.from ? { endsAt: { gt: filter.from } } : {}),
    ...(filter.to ? { startsAt: { lt: filter.to } } : {}),
    ...(filter.updatedSince ? { updatedAt: { gt: filter.updatedSince } } : {}),
  };
}

export const prismaAppointmentRepository: AppointmentRepository = {
  async findById(uow, id) {
    const row = await uow.tx.appointment.findFirst({ where: { id } });
    return row ? Appointment.restore(propsOf(row)) : null;
  },

  async findRecord(uow, id) {
    const row = await uow.tx.appointment.findFirst({ where: { id } });
    return row ? recordOf(row) : null;
  },

  async save(uow, appointment, actor): Promise<SaveOutcome> {
    const actorId = actor.userId;
    const organizationId = actor.organizationId;
    const props = appointment.snapshot;
    try {
      if (appointment.isNew) {
        await uow.tx.appointment.create({
          data: {
            id: props.id,
            organizationId,
            ...columnsOf(props),
            version: 1,
            createdById: actorId,
            updatedById: actorId,
          },
        });
      } else {
        const updated = await uow.tx.appointment.updateMany({
          where: { id: props.id, version: props.version },
          data: { ...columnsOf(props), version: { increment: 1 }, updatedById: actorId },
        });
        if (updated.count === 0) return "STALE";
      }
    } catch (error) {
      if (isExclusionViolation(error)) return "SLOT_TAKEN";
      throw error;
    }
    if (appointment.pendingStatusChanges.length > 0) {
      await uow.tx.appointmentStatusChange.createMany({
        data: appointment.pendingStatusChanges.map((change) => ({
          id: newId(),
          organizationId,
          appointmentId: props.id,
          fromStatus: change.fromStatus,
          toStatus: change.toStatus,
          changedAt: change.changedAt,
          changedById: change.changedById,
          justification: change.justification,
        })),
      });
    }
    if (appointment.pendingReschedules.length > 0) {
      await uow.tx.appointmentReschedule.createMany({
        data: appointment.pendingReschedules.map((item) => ({
          id: newId(),
          organizationId,
          appointmentId: props.id,
          ...item,
        })),
      });
    }
    return "OK";
  },

  async findOverlapping(uow, query) {
    const or: Prisma.AppointmentWhereInput[] = [];
    if (query.professionalIds?.length) or.push({ professionalId: { in: query.professionalIds } });
    if (query.roomIds?.length) or.push({ roomId: { in: query.roomIds } });
    if (query.patientIds?.length) or.push({ patientId: { in: query.patientIds } });
    if (or.length === 0) return [];
    const rows = await uow.tx.appointment.findMany({
      where: { startsAt: { lt: query.to }, endsAt: { gt: query.from }, OR: or },
      select: {
        id: true,
        professionalId: true,
        roomId: true,
        patientId: true,
        startsAt: true,
        durationMinutes: true,
        status: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      professionalId: row.professionalId,
      roomId: row.roomId,
      patientId: row.patientId,
      range: DateTimeRange.ofMinutes(row.startsAt, row.durationMinutes),
      status: row.status as AppointmentStatus,
    }));
  },

  async list(uow, filter, page) {
    const where = filterWhere(filter);
    const [rows, total] = await Promise.all([
      uow.tx.appointment.findMany({
        where,
        orderBy: page?.newestFirst
          ? [{ startsAt: "desc" }, { id: "desc" }]
          : [{ startsAt: "asc" }, { id: "asc" }],
        ...(page ? { skip: page.skip, take: page.take } : {}),
      }),
      page ? uow.tx.appointment.count({ where }) : Promise.resolve(-1),
    ]);
    return { items: rows.map(recordOf), total: total < 0 ? rows.length : total };
  },

  async seriesOccurrences(uow, seriesId) {
    const rows = await uow.tx.appointment.findMany({ where: { seriesId }, orderBy: { seriesIndex: "asc" } });
    return rows.map((row) => Appointment.restore(propsOf(row)));
  },

  async statusHistory(uow, appointmentId): Promise<StatusHistoryRow[]> {
    const rows = await uow.tx.appointmentStatusChange.findMany({
      where: { appointmentId },
      orderBy: [{ changedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => ({
      fromStatus: row.fromStatus as AppointmentStatus | null,
      toStatus: row.toStatus as AppointmentStatus,
      changedAt: row.changedAt,
      changedById: row.changedById,
      justification: row.justification,
    }));
  },

  async rescheduleHistory(uow, appointmentId): Promise<RescheduleHistoryRow[]> {
    const rows = await uow.tx.appointmentReschedule.findMany({
      where: { appointmentId },
      orderBy: { rescheduledAt: "desc" },
    });
    return rows.map((row) => ({
      previousStartsAt: row.previousStartsAt,
      previousEndsAt: row.previousEndsAt,
      previousProfessionalId: row.previousProfessionalId,
      previousRoomId: row.previousRoomId,
      previousStatus: row.previousStatus as AppointmentStatus,
      source: row.source,
      rescheduledAt: row.rescheduledAt,
      rescheduledById: row.rescheduledById,
    }));
  },
};
