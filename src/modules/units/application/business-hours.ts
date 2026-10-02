import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import {
  closedWeek,
  formatMinutes,
  normalizeWeek,
  validateWeek,
  WEEKDAY_LABELS,
  type Week,
} from "../domain/business-hours";
import { UnitsErrors } from "./errors";
import type { UnitsDeps } from "./ports";
import { replaceBusinessHoursSchema } from "./schemas";

// Reads a unit's stored intervals as a full Monday-first week (missing days are closed).
export async function readWeek(uow: UnitOfWork, unitId: string): Promise<Week> {
  const rows = await uow.tx.unitBusinessHours.findMany({
    where: { unitId },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
  });
  return closedWeek().map((day) => {
    const intervals = rows
      .filter((row) => row.weekday === day.weekday)
      .map((row) => ({ start: row.startMinute, end: row.endMinute }));
    return { weekday: day.weekday, open: intervals.length > 0, intervals };
  });
}

// Short text for the audit log, e.g. "Segunda 07:00–12:00, 13:00–20:00; Domingo fechado".
export function describeWeek(week: Week): string {
  return week
    .map((day) => {
      const label = WEEKDAY_LABELS[day.weekday];
      if (!day.open) return `${label} fechado`;
      return `${label} ${day.intervals.map((i) => `${formatMinutes(i.start)}–${formatMinutes(i.end)}`).join(", ")}`;
    })
    .join("; ");
}

export async function getBusinessHours(ctx: RequestContext, unitId: string): Promise<Result<Week>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    if (!(await uow.tx.unit.findFirst({ where: { id: unitId }, select: { id: true } }))) {
      return fail(UnitsErrors.notFound());
    }
    return ok(await readWeek(uow, unitId));
  });
}

// PRD F02: reducing hours is allowed; the response reports future appointments left outside.
export async function replaceBusinessHours(
  deps: UnitsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ affectedAppointments: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(replaceBusinessHoursSchema, input);
  if (!parsed.ok) return parsed;
  const { unitId } = parsed.value;
  const problems = validateWeek(parsed.value.days);
  if (problems) return fail(UnitsErrors.invalidHours(problems));
  const week = normalizeWeek(parsed.value.days);

  const zone = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.unit.findFirst({ where: { id: unitId }, select: { timeZone: true } })),
  );
  if (!zone.ok || !zone.value) return fail(UnitsErrors.notFound());
  const affectedAppointments = await deps
    .appointments()
    .countFutureOutsideHours(ctx.organizationId, unitId, week, deps.clock(), zone.value.timeZone);

  return withTransaction(ctx, async (uow) => {
    const unit = await uow.tx.unit.findFirst({ where: { id: unitId }, select: { id: true } });
    if (!unit) return fail(UnitsErrors.notFound());
    const before = await readWeek(uow, unitId);
    await uow.tx.unitBusinessHours.deleteMany({ where: { unitId } });
    const rows = week.flatMap((day) =>
      day.intervals.map((interval) => ({
        id: newId(),
        organizationId: ctx.organizationId,
        unitId,
        weekday: day.weekday,
        startMinute: interval.start,
        endMinute: interval.end,
      })),
    );
    if (rows.length > 0) await uow.tx.unitBusinessHours.createMany({ data: rows });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "unit",
      entityId: unitId,
      summary: "Horário de funcionamento alterado",
      changes: { businessHours: { before: describeWeek(before), after: describeWeek(week) } },
      ...(affectedAppointments > 0 ? { metadata: { affectedAppointments } } : {}),
    });
    return ok({ affectedAppointments });
  });
}
