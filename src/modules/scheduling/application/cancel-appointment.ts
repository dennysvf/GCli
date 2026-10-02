import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import type { Appointment } from "../domain/appointment";
import { SchedulingErrors } from "../domain/errors";
import { appointmentEvent, SCHEDULING_EVENTS } from "../domain/events";
import { isOpen, STATUS_LABELS } from "../domain/status";
import { isActiveReason } from "./cancellation-reasons";
import { finishChange, loadAppointment, saveChange } from "./changes";
import type { SchedulingDeps } from "./ports";
import { cancelSchema, type SeriesScope } from "./schemas";
import { withTransaction } from "@/shared/db/transaction";

export type CancelResult = { cancelledIds: string[]; skipped: number };

// Occurrences a series scope reaches (PRD F06: "Somente este", "Este e os seguintes", "Todos os
// futuros"). Only open occurrences (Agendado, Confirmado) change; the others are counted as
// skipped.
export function scopeTargets(
  selected: Appointment,
  occurrences: Appointment[],
  scope: SeriesScope,
  now: Date,
): { targets: Appointment[]; skipped: number } {
  const index = selected.snapshot.seriesIndex ?? 0;
  const reached =
    scope === "THIS"
      ? [selected]
      : scope === "THIS_AND_FOLLOWING"
        ? occurrences.filter((item) => (item.snapshot.seriesIndex ?? 0) >= index)
        : occurrences.filter((item) => item.snapshot.startsAt > now || item.id === selected.id);
  const targets = reached.filter((item) => isOpen(item.status));
  return { targets, skipped: reached.length - targets.length };
}

// PRD F06: cancellation requires origin and reason from the configurable list, plus optional text.
export async function cancelAppointment(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<CancelResult>> {
  const allowed = await authorize(ctx, "schedule:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(cancelSchema, input);
  if (!parsed.ok) {
    const fields = parsed.error.fields ?? {};
    return "origin" in fields || "reasonId" in fields
      ? fail(SchedulingErrors.cancellationIncomplete())
      : parsed;
  }
  const data = parsed.value;
  const loaded = await loadAppointment(deps, ctx, data.appointmentId);
  if (!loaded.ok) return loaded;
  const selected = loaded.value;
  const selectedBefore = { ...selected.snapshot };
  if (data.scope === "THIS" && !isOpen(selectedBefore.status)) {
    return fail(
      SchedulingErrors.invalidTransition(STATUS_LABELS[selectedBefore.status], STATUS_LABELS.CANCELLED),
    );
  }
  if (data.scope !== "THIS" && !selectedBefore.seriesId) return fail(SchedulingErrors.notInSeries());

  const now = deps.clock();
  const occurrences =
    data.scope === "THIS" || !selectedBefore.seriesId
      ? [selected]
      : await withTransaction(ctx, async (uow) =>
          ok(await deps.appointments.seriesOccurrences(uow, selectedBefore.seriesId as string)),
        ).then((result) => (result.ok ? result.value : [selected]));
  const { targets, skipped } = scopeTargets(selected, occurrences, data.scope, now);

  return finishChange(deps, ctx, selectedBefore, async (uow) => {
    if (!(await isActiveReason(uow, data.reasonId))) return fail(SchedulingErrors.invalidReason());
    const cancelledIds: string[] = [];
    for (const target of targets) {
      const before = { ...target.snapshot };
      const cancelled = target.cancel({
        origin: data.origin,
        reasonId: data.reasonId,
        note: data.note,
        now,
        actorId: ctx.user.id,
      });
      if (!cancelled.ok) return cancelled;
      const saved = await saveChange(deps, ctx, uow, target, {
        expectedVersion: target.id === selected.id ? data.version : before.version,
        before,
        metadata: {
          origin: data.origin,
          reasonId: data.reasonId,
          ...(data.scope !== "THIS" ? { scope: data.scope } : {}),
        },
        events: [
          appointmentEvent(SCHEDULING_EVENTS.cancelled, target.snapshot, {
            previousStatus: before.status,
            actorUserId: ctx.user.id,
            now,
          }),
        ],
      });
      if (!saved.ok) return saved;
      cancelledIds.push(target.id);
    }
    return ok({ cancelledIds, skipped });
  });
}
