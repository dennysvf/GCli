import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { checkConflicts, resolveFindings } from "../domain/conflicts/check";
import { SchedulingErrors } from "../domain/errors";
import { appointmentEvent, SCHEDULING_EVENTS } from "../domain/events";
import { isOpen } from "../domain/status";
import {
  decisionOf,
  findingDtos,
  resolveRefs,
  startInstant,
  unresolvedError,
  type FindingDto,
} from "./booking";
import { finishChange, loadAppointment, saveChange } from "./changes";
import { loadConflictContext } from "./conflict-context";
import type { SchedulingDeps } from "./ports";
import { rescheduleSchema } from "./schemas";

export type RescheduleResult = {
  appointmentId: string;
  status: string;
  startsAt: string;
  version: number;
  warnings: FindingDto[];
};

// PRD F06: rescheduling keeps the same record, stores the previous date, time, professional and
// room in history, and resets the status to Agendado. Used by the form and by drag-and-drop.
export async function rescheduleAppointment(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<RescheduleResult>> {
  const allowed = await authorize(ctx, "schedule:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(rescheduleSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const loaded = await loadAppointment(deps, ctx, data.appointmentId);
  if (!loaded.ok) return loaded;
  const appointment = loaded.value;
  const before = { ...appointment.snapshot };
  if (!isOpen(before.status)) return fail(SchedulingErrors.notEditable());

  const refs = await resolveRefs(deps, ctx, {
    unitId: before.unitId,
    serviceId: before.serviceId,
    professionalId: data.professionalId,
    roomId: data.roomId,
    patientId: null,
  });
  if (!refs.ok) return refs;
  const start = startInstant(refs.value, data.date, data.startTime);
  if (!start.ok) return start;
  const { unit, professional, room } = refs.value;
  const range = DateTimeRange.ofMinutes(start.value.startsAt, before.durationMinutes);

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
    { canOverrideAvailability: can(ctx, "schedule:override-availability"), checkPastStart: true },
  );
  const resolution = resolveFindings(findings, data);
  if (!resolution.ok) return fail(unresolvedError(resolution));
  const decision = decisionOf(resolution, data.exceptionJustification);

  const now = deps.clock();
  const moved = appointment.reschedule({
    startsAt: range.start,
    professionalId: professional.id,
    roomId: room?.id ?? null,
    decision,
    source: data.source,
    now,
    actorId: ctx.user.id,
  });
  if (!moved.ok) return moved;

  return finishChange(deps, ctx, before, async (uow) => {
    const saved = await saveChange(deps, ctx, uow, appointment, {
      expectedVersion: data.version,
      before,
      metadata: {
        source: data.source,
        ...(decision.exceptionCodes.length > 0
          ? {
              exceptionCodes: decision.exceptionCodes,
              exceptionJustification: decision.exceptionJustification,
            }
          : {}),
      },
      events: [
        appointmentEvent(SCHEDULING_EVENTS.rescheduled, appointment.snapshot, {
          previousStatus: before.status,
          actorUserId: ctx.user.id,
          now,
        }),
      ],
    });
    if (!saved.ok) return saved;
    return ok({
      appointmentId: before.id,
      status: appointment.status,
      startsAt: range.start.toISOString(),
      version: before.version + 1,
      warnings: findingDtos(resolution.warnings),
    });
  });
}
