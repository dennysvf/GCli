import type { Currency } from "@/shared/kernel/countries/codes";
import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import type { AvailabilityDecision } from "../domain/appointment";
import { checkConflicts, resolveFindings } from "../domain/conflicts/check";
import { SchedulingErrors } from "../domain/errors";
import { appointmentEvent, SCHEDULING_EVENTS } from "../domain/events";
import { isOpen } from "../domain/status";
import { decisionOf, findingDtos, resolveRefs, unresolvedError, type FindingDto } from "./booking";
import { finishChange, loadAppointment, saveChange } from "./changes";
import { loadConflictContext } from "./conflict-context";
import type { SchedulingDeps } from "./ports";
import { updateSchema } from "./schemas";

export type UpdateResult = {
  appointmentId: string;
  price: { amountMinor: number; currency: string };
  version: number;
  warnings: FindingDto[];
};

// Spec F06: service, duration, room and notes change only before check-in. A new service takes a
// new price snapshot; a duration change (also by resizing on the agenda) keeps the price. Changes
// that affect time, professional or room are checked for conflicts again.
export async function updateAppointment(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<UpdateResult>> {
  const allowed = await authorize(ctx, "schedule:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const loaded = await loadAppointment(deps, ctx, data.appointmentId);
  if (!loaded.ok) return loaded;
  const appointment = loaded.value;
  const before = { ...appointment.snapshot };
  if (!isOpen(before.status)) return fail(SchedulingErrors.notEditable());

  const serviceChanged = data.serviceId !== undefined && data.serviceId !== before.serviceId;
  const roomId = data.roomId === undefined ? before.roomId : data.roomId;
  const needsCheck =
    serviceChanged ||
    (data.durationMinutes !== undefined && data.durationMinutes !== before.durationMinutes) ||
    roomId !== before.roomId;

  let decision: AvailabilityDecision | undefined;
  let priceMinor: number | undefined;
  let currency: Currency | undefined;
  let warnings: FindingDto[] = [];
  let durationMinutes = data.durationMinutes;
  if (needsCheck) {
    const refs = await resolveRefs(deps, ctx, {
      unitId: before.unitId,
      serviceId: data.serviceId ?? before.serviceId,
      professionalId: before.professionalId,
      roomId,
      patientId: null,
    });
    if (!refs.ok) return refs;
    const { unit, service, professional, room } = refs.value;
    if (serviceChanged) {
      priceMinor = refs.value.priceMinor;
      currency = unit.currency;
      durationMinutes ??= service.durationMinutes;
    }
    const range = DateTimeRange.ofMinutes(before.startsAt, durationMinutes ?? before.durationMinutes);
    const context = await loadConflictContext(deps, ctx, {
      unit,
      professionalId: professional.id,
      professionalName: professional.displayName,
      roomIds: room ? [room.id] : [],
      roomName: room?.name ?? null,
      patientId: before.patientId,
      window: { from: range.start, to: range.end },
    });
    const findings = checkConflicts(
      {
        appointmentId: before.id,
        unitId: unit.id,
        professionalId: professional.id,
        roomId: room?.id ?? null,
        patientId: before.patientId,
        range,
      },
      context,
      { canOverrideAvailability: can(ctx, "schedule:override-availability"), checkPastStart: false },
    );
    const resolution = resolveFindings(findings, data);
    if (!resolution.ok) return fail(unresolvedError(resolution));
    decision = decisionOf(resolution, data.exceptionJustification);
    warnings = findingDtos(resolution.warnings);
  }

  const edited = appointment.edit({
    ...(serviceChanged && data.serviceId ? { serviceId: data.serviceId } : {}),
    ...(priceMinor !== undefined ? { priceMinor } : {}),
    ...(currency !== undefined ? { currency } : {}),
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    ...(roomId !== before.roomId ? { roomId } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(decision ? { decision } : {}),
  });
  if (!edited.ok) return edited;

  return finishChange(deps, ctx, before, async (uow) => {
    const saved = await saveChange(deps, ctx, uow, appointment, {
      expectedVersion: data.version,
      before,
      ...(decision?.exceptionCodes.length
        ? {
            metadata: {
              exceptionCodes: decision.exceptionCodes,
              exceptionJustification: decision.exceptionJustification,
            },
          }
        : {}),
      events: [
        appointmentEvent(SCHEDULING_EVENTS.updated, appointment.snapshot, {
          previousStatus: before.status,
          actorUserId: ctx.user.id,
          now: deps.clock(),
          ...(data.packageId !== undefined
            ? { packageLink: { packageId: data.packageId, mode: "STRICT" as const } }
            : {}),
        }),
      ],
    });
    if (!saved.ok) return saved;
    return ok({
      appointmentId: before.id,
      price: { amountMinor: appointment.snapshot.priceMinor, currency: appointment.snapshot.currency },
      version: before.version + 1,
      warnings,
    });
  });
}
