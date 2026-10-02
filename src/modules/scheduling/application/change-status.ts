import type { RequestContext } from "@/shared/context/types";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { SchedulingErrors } from "../domain/errors";
import { appointmentEvent, TRANSITION_EVENTS } from "../domain/events";
import { resolveTransition, STATUS_LABELS, type AppointmentStatus } from "../domain/status";
import { finishChange, loadAppointment, saveChange } from "./changes";
import { actorOf, authorizeTransition } from "./policies";
import type { SchedulingDeps } from "./ports";
import { statusChangeSchema } from "./schemas";

export type StatusChangeResult = { status: AppointmentStatus; statusChangedAt: string; version: number };

// One entry point for ConfirmAppointment, UnconfirmAppointment, CheckInAppointment, UndoCheckIn,
// StartAppointment, CompleteAppointment, RevertCompletion and MarkNoShow (PRD F06 lifecycle).
// The event of each transition is published inside the transaction (F09 charge on check-in,
// F10 package debit on completion).
export async function changeAppointmentStatus(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<StatusChangeResult>> {
  const parsed = parseInput(statusChangeSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const loaded = await loadAppointment(deps, ctx, data.appointmentId);
  if (!loaded.ok) return loaded;
  const appointment = loaded.value;
  const before = { ...appointment.snapshot };

  const transition = resolveTransition(before.status, data.to);
  if (!transition || transition === "CANCEL") {
    return fail(SchedulingErrors.invalidTransition(STATUS_LABELS[before.status], STATUS_LABELS[data.to]));
  }
  const allowed = await authorizeTransition(ctx, transition, before);
  if (!allowed.ok) return allowed;

  const now = deps.clock();
  const changed = appointment.transition(data.to, {
    now,
    actor: actorOf(ctx, before),
    justification: data.justification,
  });
  if (!changed.ok) return changed;
  const justification = appointment.pendingStatusChanges.at(-1)?.justification ?? null;

  return finishChange(deps, ctx, before, async (uow) => {
    const saved = await saveChange(deps, ctx, uow, appointment, {
      expectedVersion: data.version,
      before,
      metadata: { transition, ...(justification ? { justification } : {}) },
      events: [
        appointmentEvent(TRANSITION_EVENTS[transition], appointment.snapshot, {
          previousStatus: before.status,
          actorUserId: ctx.user.id,
          now,
        }),
      ],
    });
    if (!saved.ok) return saved;
    return ok({
      status: appointment.status,
      statusChangedAt: now.toISOString(),
      version: before.version + 1,
    });
  });
}
