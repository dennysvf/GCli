import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import { ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { checkConflicts } from "../domain/conflicts/check";
import { findingDtos, resolveRefs, startInstant, type FindingDto } from "./booking";
import { loadConflictContext } from "./conflict-context";
import type { SchedulingDeps } from "./ports";
import { conflictPreviewSchema } from "./schemas";

export type ConflictPreview = {
  findings: FindingDto[];
  endsAt: string;
  priceCents: number;
  durationMinutes: number;
};

// Advisory preview for the booking panel (PRD F06 Experience: conflicts shown inline before
// saving). Saving checks everything again.
export async function previewConflicts(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ConflictPreview>> {
  const allowed = await authorize(ctx, "schedule:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(conflictPreviewSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const refs = await resolveRefs(deps, ctx, { ...data, patientId: data.patientId ?? null });
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
    patientId: data.patientId ?? null,
    window: { from: range.start, to: range.end },
  });
  const findings = checkConflicts(
    {
      ...(data.appointmentId ? { appointmentId: data.appointmentId } : {}),
      unitId: unit.id,
      professionalId: professional.id,
      roomId: room?.id ?? null,
      patientId: data.patientId ?? "",
      range,
    },
    context,
    { canOverrideAvailability: can(ctx, "schedule:override-availability"), checkPastStart: true },
  );
  return ok({
    findings: findingDtos(findings),
    endsAt: range.end.toISOString(),
    priceCents: service.priceCents,
    durationMinutes,
  });
}
