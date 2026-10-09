import type { Currency } from "@/shared/kernel/countries/codes";
import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { diffChanges } from "@/shared/audit/diff";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { Appointment, type AppointmentProps } from "../domain/appointment";
import { checkConflicts, resolveFindings } from "../domain/conflicts/check";
import { SchedulingErrors } from "../domain/errors";
import { appointmentEvent, SCHEDULING_EVENTS, type PackageLinkRequest } from "../domain/events";
import {
  decisionOf,
  findingDtos,
  resolveRefs,
  startInstant,
  unresolvedError,
  type FindingDto,
} from "./booking";
import { loadConflictContext } from "./conflict-context";
import type { SchedulingDeps } from "./ports";
import { bookingSchema } from "./schemas";

export type BookResult = {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  price: { amountMinor: number; currency: Currency };
  isOverbooking: boolean;
  warnings: FindingDto[];
  version: number;
};

const AUDITED_FIELDS: (keyof AppointmentProps)[] = [
  "unitId",
  "professionalId",
  "serviceId",
  "patientId",
  "roomId",
  "startsAt",
  "durationMinutes",
  "priceMinor",
  "currency",
  "status",
  "isOverbooking",
  "notes",
  "seriesId",
];

export function auditChanges(before: Readonly<AppointmentProps> | null, after: Readonly<AppointmentProps>) {
  return diffChanges<AppointmentProps>(before, after, { fields: AUDITED_FIELDS });
}

// Persists a new appointment with its audit entry and event, inside the caller's transaction.
export async function insertAppointment(
  deps: SchedulingDeps,
  ctx: RequestContext,
  uow: UnitOfWork,
  appointment: Appointment,
  packageLink?: PackageLinkRequest,
): Promise<Result<void>> {
  const outcome = await deps.appointments.save(uow, appointment, {
    userId: ctx.user.id,
    organizationId: ctx.organizationId,
  });
  if (outcome === "SLOT_TAKEN") return fail(SchedulingErrors.slotTaken());
  const props = appointment.snapshot;
  await uow.audit.record({
    action: "CREATE",
    entityType: "appointment",
    entityId: props.id,
    changes: auditChanges(null, props),
    metadata: {
      isOverbooking: props.isOverbooking,
      ...(props.exceptionCodes.length > 0
        ? { exceptionCodes: props.exceptionCodes, exceptionJustification: props.exceptionJustification }
        : {}),
      ...(props.seriesId ? { seriesId: props.seriesId, seriesIndex: props.seriesIndex } : {}),
    },
  });
  await uow.publish(
    appointmentEvent(SCHEDULING_EVENTS.booked, props, {
      previousStatus: null,
      actorUserId: ctx.user.id,
      now: deps.clock(),
      ...(packageLink ? { packageLink } : {}),
    }),
  );
  return ok(undefined);
}

// PRD F06: duration and price come from the service; conflicts are validated on the server, with
// Encaixe and justified exceptions as the only overrides.
export async function bookAppointment(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<BookResult>> {
  const allowed = await authorize(ctx, "schedule:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(bookingSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;

  const refs = await resolveRefs(deps, ctx, data);
  if (!refs.ok) return refs;
  const start = startInstant(refs.value, data.date, data.startTime);
  if (!start.ok) return start;
  const { unit, service, professional, room } = refs.value;
  const durationMinutes = data.durationMinutes ?? service.durationMinutes;
  const range = DateTimeRange.ofMinutes(start.value.startsAt, durationMinutes);

  const context = await loadConflictContext(deps, ctx, {
    unit,
    professionalId: professional.id,
    professionalName: professional.displayName,
    roomIds: room ? [room.id] : [],
    roomName: room?.name ?? null,
    patientId: data.patientId,
    window: { from: range.start, to: range.end },
  });
  const findings = checkConflicts(
    {
      unitId: unit.id,
      professionalId: professional.id,
      roomId: room?.id ?? null,
      patientId: data.patientId,
      range,
    },
    context,
    { canOverrideAvailability: can(ctx, "schedule:override-availability"), checkPastStart: true },
  );
  const resolution = resolveFindings(findings, data);
  if (!resolution.ok) return fail(unresolvedError(resolution));

  const booked = Appointment.book({
    id: newId(),
    unitId: unit.id,
    professionalId: professional.id,
    serviceId: service.id,
    patientId: data.patientId,
    roomId: room?.id ?? null,
    startsAt: range.start,
    durationMinutes,
    // PRD F06: price snapshot from the service at booking.
    priceMinor: refs.value.priceMinor,
    currency: unit.currency,
    notes: data.notes,
    seriesId: null,
    seriesIndex: null,
    decision: decisionOf(resolution, data.exceptionJustification),
    actorId: ctx.user.id,
    now: deps.clock(),
  });
  if (!booked.ok) return booked;
  const appointment = booked.value;

  return withTransaction(ctx, async (uow) => {
    const saved = await insertAppointment(
      deps,
      ctx,
      uow,
      appointment,
      data.packageId ? { packageId: data.packageId, mode: "STRICT" } : undefined,
    );
    if (!saved.ok) return saved;
    const props = appointment.snapshot;
    return ok({
      appointmentId: props.id,
      startsAt: props.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      price: { amountMinor: props.priceMinor, currency: props.currency },
      isOverbooking: props.isOverbooking,
      warnings: findingDtos(resolution.warnings),
      version: 1,
    });
  });
}
