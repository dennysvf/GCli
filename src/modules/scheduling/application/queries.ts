import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { daysBetween, isoWeekday, addDays } from "@/shared/kernel/calendar-date";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { localMinuteToUtc } from "@/shared/kernel/zoned-time";
import { SchedulingErrors } from "../domain/errors";
import { AGENDA_MAX_DAYS, LIST_PAGE_SIZE } from "../domain/limits";
import type { AppointmentStatus } from "../domain/status";
import { authorizeRead, canSee, type AgendaScope } from "./policies";
import type { AppointmentFilter, AppointmentRecord, LocalInterval, SchedulingDeps, UnitInfo } from "./ports";
import { agendaQuerySchema, listQuerySchema } from "./schemas";

// Read side of the agenda (PRD F06 views, Provides). Every query applies the reader's scope:
// a Professional sees only their own appointments, across all units.

export type AgendaItem = {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  statusChangedAt: string;
  isOverbooking: boolean;
  patient: { id: string; displayName: string; mobilePhone: string | null };
  service: { id: string; name: string; color: string };
  professional: { id: string; displayName: string; color: string };
  room: { id: string; name: string } | null;
  unitId: string;
  unitName: string;
  unitTimeZone: string;
  seriesId: string | null;
  seriesIndex: number | null;
  notes: string | null;
  price: { amountMinor: number; currency: string };
  // PRD F10: "Sessão 4/10" for an appointment linked to a package.
  package: { packageId: string; session: number; total: number; flagged: boolean } | null;
  updatedAt: string;
  version: number;
};

export type AgendaColumn = {
  id: string;
  label: string;
  color: string | null;
  workingIntervals: { date: string; start: number; end: number }[];
};

export type AgendaDayHours = {
  date: string;
  intervals: LocalInterval[];
  closure: string | null;
};

export type Agenda = {
  serverTime: string;
  timeZone: string;
  items: AgendaItem[];
  professionals?: AgendaColumn[];
  rooms?: AgendaColumn[];
  unitHours?: AgendaDayHours[];
};

function scopedFilter(scope: AgendaScope, filter: AppointmentFilter): AppointmentFilter {
  if (scope.kind !== "own") return filter;
  // Own agenda: the professional filter is forced, whatever the request asked for.
  return { ...filter, professionalIds: [scope.professionalId] };
}

// Names for many appointments at once, through the consumed modules' public APIs.
export async function toItems(
  deps: SchedulingDeps,
  ctx: RequestContext,
  records: AppointmentRecord[],
  units: { id: string; name: string; timeZone: string }[],
): Promise<AgendaItem[]> {
  if (records.length === 0) return [];
  const unique = <T>(values: T[]) => [...new Set(values)];
  const [patients, services, professionals, rooms] = await Promise.all([
    deps.directory.patients(ctx, unique(records.map((row) => row.patientId))),
    deps.directory.services(ctx, unique(records.map((row) => row.serviceId))),
    deps.directory.professionals(ctx, unique(records.map((row) => row.professionalId))),
    deps.directory.rooms(ctx, unique(records.flatMap((row) => (row.roomId ? [row.roomId] : [])))),
  ]);
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((item) => [item.id, item]));
  const [patientMap, serviceMap, professionalMap, roomMap, unitMap] = [
    byId(patients),
    byId(services),
    byId(professionals),
    byId(rooms),
    byId(units),
  ];
  const links = await deps.packageLinks().linkStates(
    ctx.organizationId,
    records.map((row) => row.id),
  );
  return records.map((row) => {
    const patient = patientMap.get(row.patientId);
    const service = serviceMap.get(row.serviceId);
    const professional = professionalMap.get(row.professionalId);
    const room = row.roomId ? roomMap.get(row.roomId) : undefined;
    const unit = unitMap.get(row.unitId);
    return {
      id: row.id,
      startsAt: row.startsAt.toISOString(),
      endsAt: new Date(row.startsAt.getTime() + row.durationMinutes * 60_000).toISOString(),
      durationMinutes: row.durationMinutes,
      status: row.status,
      statusChangedAt: row.statusChangedAt.toISOString(),
      isOverbooking: row.isOverbooking,
      patient: {
        id: row.patientId,
        displayName: patient?.displayName ?? "Paciente",
        mobilePhone: patient?.mobilePhone ?? null,
      },
      service: { id: row.serviceId, name: service?.name ?? "Serviço", color: service?.color ?? "slate" },
      professional: {
        id: row.professionalId,
        displayName: professional?.displayName ?? "Profissional",
        color: professional?.color ?? "slate",
      },
      room: row.roomId ? { id: row.roomId, name: room?.name ?? "Sala" } : null,
      unitId: row.unitId,
      unitName: unit?.name ?? "",
      unitTimeZone: unit?.timeZone ?? "America/Sao_Paulo",
      seriesId: row.seriesId,
      seriesIndex: row.seriesIndex,
      notes: row.notes,
      price: { amountMinor: row.priceMinor, currency: row.currency },
      package: links.get(row.id) ?? null,
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    };
  });
}

function dayHours(unit: UnitInfo, from: string, to: string): AgendaDayHours[] {
  const days: AgendaDayHours[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const closure = unit.closures.find((item) => item.startsOn <= date && date <= item.endsOn);
    days.push({
      date,
      intervals: unit.businessHours.get(isoWeekday(date)) ?? [],
      closure: closure?.reason ?? null,
    });
  }
  return days;
}

async function professionalColumns(
  deps: SchedulingDeps,
  ctx: RequestContext,
  unit: UnitInfo,
  range: { from: string; to: string },
  withAppointments: string[],
  scope: AgendaScope,
): Promise<AgendaColumn[]> {
  const bookable =
    scope.kind === "own" ? [] : await deps.directory.bookableProfessionals(ctx, { unitId: unit.id });
  const ids = new Set([...bookable.map((item) => item.id), ...withAppointments]);
  if (scope.kind === "own") ids.add(scope.professionalId);
  const people = await deps.directory.professionals(ctx, [...ids]);
  const columns = await Promise.all(
    people.map(async (person) => {
      const calendar = await deps.directory.workingCalendar(ctx, person.id, range);
      const intervals = (calendar?.days ?? []).flatMap((day) =>
        (day.units.find((item) => item.unitId === unit.id)?.intervals ?? []).map((interval) => ({
          date: day.date,
          ...interval,
        })),
      );
      return { id: person.id, label: person.displayName, color: person.color, workingIntervals: intervals };
    }),
  );
  // Professionals without hours in the range appear only when they have appointments there.
  return columns
    .filter((column) => column.workingIntervals.length > 0 || withAppointments.includes(column.id))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

// Day and Week views plus the 30-second polling (spec F06: `since` returns only changed rows,
// including cancelled ones so the client can remove them).
export async function getAgenda(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<Agenda>> {
  const scope = await authorizeRead(ctx);
  if (!scope.ok) return scope;
  const parsed = parseInput(agendaQuerySchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  if (data.to < data.from || daysBetween(data.from, data.to) >= AGENDA_MAX_DAYS) {
    return fail(SchedulingErrors.validation({ to: "scheduling.validation.periodTooLong" }));
  }
  if (data.unitId === "all" && scope.value.kind !== "own") {
    return fail(SchedulingErrors.validation({ unitId: "scheduling.validation.unitRequired" }));
  }
  const [organization, allUnits] = await Promise.all([
    deps.directory.organization(ctx),
    deps.directory.listUnits(ctx),
  ]);
  const unit = data.unitId === "all" ? null : await deps.directory.unit(ctx, data.unitId);
  if (data.unitId !== "all" && !unit)
    return fail(SchedulingErrors.validation({ unitId: "scheduling.validation.unitNotFound" }));
  const timeZone = unit?.timeZone ?? organization.timeZone;
  const serverTime = deps.clock();
  // Polling (`since`) returns every change in the unit, whatever the period and filters, so an
  // appointment moved out of the visible range still reaches open agendas; the client filters.
  const filter = scopedFilter(
    scope.value,
    data.since
      ? { ...(unit ? { unitId: unit.id } : {}), updatedSince: new Date(data.since) }
      : {
          ...(unit ? { unitId: unit.id } : {}),
          from: localMinuteToUtc(data.from, 0, timeZone),
          to: localMinuteToUtc(data.to, 1440, timeZone),
          ...(data.professionalIds ? { professionalIds: data.professionalIds } : {}),
          ...(data.roomIds ? { roomIds: data.roomIds } : {}),
          ...(data.serviceIds ? { serviceIds: data.serviceIds } : {}),
          ...(data.statuses ? { statuses: data.statuses } : {}),
        },
  );
  const listed = await withTransaction(ctx, async (uow) =>
    ok(await deps.appointments.list(uow, filter, null)),
  );
  if (!listed.ok) return listed;
  const items = await toItems(deps, ctx, listed.value.items, allUnits);
  const agenda: Agenda = { serverTime: serverTime.toISOString(), timeZone, items };
  if (data.since || !unit) return ok(agenda);

  const range = { from: data.from, to: data.to };
  const withAppointments = [...new Set(listed.value.items.map((row) => row.professionalId))];
  agenda.professionals = await professionalColumns(deps, ctx, unit, range, withAppointments, scope.value);
  agenda.rooms = unit.rooms
    .filter((room) => room.active)
    .map((room) => ({ id: room.id, label: room.name, color: null, workingIntervals: [] }));
  agenda.unitHours = dayHours(unit, data.from, data.to);
  return ok(agenda);
}

export type AppointmentList = { items: AgendaItem[]; page: number; pageSize: number; total: number };

// List view (PRD F06: pages of 50) and the paginated read API for F13 and F14.
export async function listAppointments(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<AppointmentList>> {
  const scope = await authorizeRead(ctx);
  if (!scope.ok) return scope;
  const parsed = parseInput(listQuerySchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  if (data.to < data.from)
    return fail(SchedulingErrors.validation({ to: "scheduling.validation.endBeforeStart" }));
  const [organization, allUnits] = await Promise.all([
    deps.directory.organization(ctx),
    deps.directory.listUnits(ctx),
  ]);
  const unit = data.unitId === "all" ? null : allUnits.find((item) => item.id === data.unitId);
  const timeZone = unit?.timeZone ?? organization.timeZone;
  const filter = scopedFilter(scope.value, {
    ...(unit ? { unitId: unit.id } : {}),
    from: localMinuteToUtc(data.from, 0, timeZone),
    to: localMinuteToUtc(data.to, 1440, timeZone),
    ...(data.professionalIds ? { professionalIds: data.professionalIds } : {}),
    ...(data.roomIds ? { roomIds: data.roomIds } : {}),
    ...(data.serviceIds ? { serviceIds: data.serviceIds } : {}),
    ...(data.statuses ? { statuses: data.statuses } : {}),
    ...(data.patientId ? { patientId: data.patientId } : {}),
  });
  const page = data.page;
  const listed = await withTransaction(ctx, async (uow) =>
    ok(
      await deps.appointments.list(uow, filter, { skip: (page - 1) * LIST_PAGE_SIZE, take: LIST_PAGE_SIZE }),
    ),
  );
  if (!listed.ok) return listed;
  return ok({
    items: await toItems(deps, ctx, listed.value.items, allUnits),
    page,
    pageSize: LIST_PAGE_SIZE,
    total: listed.value.total,
  });
}

// The Agendamentos tab of the patient page (spec F06): every appointment of the patient, newest
// first, in pages of 50.
export async function listPatientAppointments(
  deps: SchedulingDeps,
  ctx: RequestContext,
  patientId: string,
  page = 1,
): Promise<Result<AppointmentList>> {
  const scope = await authorizeRead(ctx);
  if (!scope.ok) return scope;
  const allUnits = await deps.directory.listUnits(ctx);
  const filter = scopedFilter(scope.value, { patientId });
  const listed = await withTransaction(ctx, async (uow) =>
    ok(
      await deps.appointments.list(uow, filter, {
        skip: (page - 1) * LIST_PAGE_SIZE,
        take: LIST_PAGE_SIZE,
        newestFirst: true,
      }),
    ),
  );
  if (!listed.ok) return listed;
  const items = await toItems(deps, ctx, listed.value.items, allUnits);
  return ok({
    items,
    page,
    pageSize: LIST_PAGE_SIZE,
    total: listed.value.total,
  });
}

export type AppointmentDetails = AgendaItem & {
  exceptionJustification: string | null;
  exceptionCodes: string[];
  cancellation: {
    origin: string;
    reasonId: string;
    reasonName: string;
    note: string | null;
    cancelledAt: string;
  } | null;
  statusHistory: {
    fromStatus: AppointmentStatus | null;
    toStatus: AppointmentStatus;
    changedAt: string;
    changedByName: string;
    justification: string | null;
  }[];
  reschedules: {
    previousStartsAt: string;
    previousEndsAt: string;
    previousProfessionalName: string;
    previousRoomName: string | null;
    previousStatus: AppointmentStatus;
    source: string;
    rescheduledAt: string;
    rescheduledByName: string;
  }[];
  createdById: string | null;
  createdAt: string;
  // F07: state of the appointment's clinical note, only for users who can read clinical records.
  clinicalNote: { state: "NONE" | "DRAFT" | "FINALIZED" } | null;
};

// Details for the side panel and the read API for F07, F09, F10 and F14.
export async function getAppointment(
  deps: SchedulingDeps,
  ctx: RequestContext,
  appointmentId: string,
): Promise<Result<AppointmentDetails>> {
  const scope = await authorizeRead(ctx);
  if (!scope.ok) return scope;
  const loaded = await withTransaction(ctx, async (uow) => {
    const record = await deps.appointments.findRecord(uow, appointmentId);
    if (!record) return ok(null);
    const [statusHistory, reschedules, reason] = await Promise.all([
      deps.appointments.statusHistory(uow, appointmentId),
      deps.appointments.rescheduleHistory(uow, appointmentId),
      record.cancellation
        ? uow.tx.cancellationReason.findFirst({
            where: { id: record.cancellation.reasonId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);
    return ok({ record, statusHistory, reschedules, reasonName: reason?.name ?? "" });
  });
  if (!loaded.ok) return loaded;
  const value = loaded.value;
  if (!value || !canSee(scope.value, value.record)) return fail(SchedulingErrors.notFound());
  const { record, statusHistory, reschedules, reasonName } = value;
  const allUnits = await deps.directory.listUnits(ctx);
  const [item] = await toItems(deps, ctx, [record], allUnits);
  const userIds = [
    ...statusHistory.map((row) => row.changedById),
    ...reschedules.map((row) => row.rescheduledById),
  ];
  const [names, previousPeople, previousRooms] = await Promise.all([
    deps.directory.userNames(ctx, userIds),
    deps.directory.professionals(
      ctx,
      reschedules.map((row) => row.previousProfessionalId),
    ),
    deps.directory.rooms(
      ctx,
      reschedules.flatMap((row) => (row.previousRoomId ? [row.previousRoomId] : [])),
    ),
  ]);
  if (!item) return fail(SchedulingErrors.notFound());
  const clinicalNote = can(ctx, "clinical:read")
    ? {
        state:
          (await deps.clinicalNotes().noteStates(ctx.organizationId, [appointmentId], ctx.user.id)).get(
            appointmentId,
          ) ?? ("NONE" as const),
      }
    : null;
  return ok({
    ...item,
    clinicalNote,
    exceptionJustification: record.exceptionJustification,
    exceptionCodes: record.exceptionCodes,
    cancellation: record.cancellation
      ? {
          origin: record.cancellation.origin,
          reasonId: record.cancellation.reasonId,
          reasonName,
          note: record.cancellation.note,
          cancelledAt: record.cancellation.cancelledAt.toISOString(),
        }
      : null,
    statusHistory: statusHistory.map((row) => ({
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      changedAt: row.changedAt.toISOString(),
      changedByName: names.get(row.changedById) ?? "",
      justification: row.justification,
    })),
    reschedules: reschedules.map((row) => ({
      previousStartsAt: row.previousStartsAt.toISOString(),
      previousEndsAt: row.previousEndsAt.toISOString(),
      previousProfessionalName:
        previousPeople.find((person) => person.id === row.previousProfessionalId)?.displayName ?? "",
      previousRoomName: row.previousRoomId
        ? (previousRooms.find((room) => room.id === row.previousRoomId)?.name ?? null)
        : null,
      previousStatus: row.previousStatus,
      source: row.source,
      rescheduledAt: row.rescheduledAt.toISOString(),
      rescheduledByName: names.get(row.rescheduledById) ?? "",
    })),
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
  });
}
