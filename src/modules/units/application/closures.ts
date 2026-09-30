import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { CLOSURE_MAX_DAYS, MAX_FUTURE_CLOSURES_PER_UNIT } from "../domain/limits";
import { UnitsErrors } from "./errors";
import type { UnitsDeps } from "./ports";
import { createClosureSchema, deleteClosureSchema } from "./schemas";

export type ClosureItem = { id: string; unitId: string; startsOn: string; endsOn: string; reason: string };

// Closures are whole days (PostgreSQL date); the application exchanges them as YYYY-MM-DD.
export const toDbDate = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
export const fromDbDate = (date: Date) => date.toISOString().slice(0, 10);

function daysBetween(startsOn: string, endsOn: string): number {
  return Math.round((toDbDate(endsOn).getTime() - toDbDate(startsOn).getTime()) / 86_400_000);
}

// Upcoming closures: those that end today or later in the unit's time zone.
export async function listClosures(
  ctx: RequestContext,
  unitId: string,
  now: Date,
): Promise<Result<ClosureItem[]>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const unit = await uow.tx.unit.findFirst({ where: { id: unitId }, select: { timeZone: true } });
    if (!unit) return fail(UnitsErrors.notFound());
    const today = toDbDate(dateInTimeZone(now, unit.timeZone));
    const rows = await uow.tx.unitClosure.findMany({
      where: { unitId, endsOn: { gte: today } },
      orderBy: { startsOn: "asc" },
    });
    return ok(
      rows.map((row) => ({
        id: row.id,
        unitId: row.unitId,
        startsOn: fromDbDate(row.startsOn),
        endsOn: fromDbDate(row.endsOn),
        reason: row.reason,
      })),
    );
  });
}

// PRD F02: a closure over existing appointments needs confirmation; appointments are not cancelled.
export async function createClosure(
  deps: UnitsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ closureId: string; overlappingAppointments: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createClosureSchema, input);
  if (!parsed.ok) return parsed;
  const { unitId, startsOn, endsOn, reason, confirmOverlap } = parsed.value;

  const unit = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.unit.findFirst({ where: { id: unitId }, select: { timeZone: true } })),
  );
  if (!unit.ok || !unit.value) return fail(UnitsErrors.notFound());
  const today = dateInTimeZone(deps.clock(), unit.value.timeZone);
  if (startsOn < today) {
    return fail(CommonErrors.validationFailed({ startsOn: "A data inicial não pode estar no passado." }));
  }
  if (daysBetween(startsOn, endsOn) > CLOSURE_MAX_DAYS) {
    return fail(CommonErrors.validationFailed({ endsOn: "O fechamento pode durar no máximo 366 dias." }));
  }

  const overlapping = await deps
    .appointments()
    .countInDateRange(ctx.organizationId, unitId, startsOn, endsOn);
  if (overlapping > 0 && !confirmOverlap) return fail(UnitsErrors.closureConfirmationRequired(overlapping));

  return withTransaction(ctx, async (uow) => {
    const future = await uow.tx.unitClosure.count({ where: { unitId, endsOn: { gte: toDbDate(today) } } });
    if (future >= MAX_FUTURE_CLOSURES_PER_UNIT) return fail(UnitsErrors.closureLimit());
    const id = newId();
    await uow.tx.unitClosure.create({
      data: {
        id,
        organizationId: ctx.organizationId,
        unitId,
        startsOn: toDbDate(startsOn),
        endsOn: toDbDate(endsOn),
        reason,
        createdById: ctx.user.id,
      },
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "unit_closure",
      entityId: id,
      summary: `Fechamento de ${startsOn} a ${endsOn}`,
      changes: {
        startsOn: { before: null, after: startsOn },
        endsOn: { before: null, after: endsOn },
        reason: { before: null, after: reason },
      },
      ...(overlapping > 0
        ? { metadata: { unitId, overlappingAppointments: overlapping } }
        : { metadata: { unitId } }),
    });
    return ok({ closureId: id, overlappingAppointments: overlapping });
  });
}

// Closures that have not ended yet can be removed; past closures stay as history.
export async function deleteClosure(
  deps: UnitsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<Record<string, never>>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(deleteClosureSchema, input);
  if (!parsed.ok) return parsed;

  return withTransaction(ctx, async (uow) => {
    const closure = await uow.tx.unitClosure.findFirst({
      where: { id: parsed.value.closureId },
      include: { unit: { select: { timeZone: true } } },
    });
    if (!closure) return fail(UnitsErrors.notFound());
    const today = dateInTimeZone(deps.clock(), closure.unit.timeZone);
    if (fromDbDate(closure.endsOn) < today) return fail(UnitsErrors.closureInPast());
    await uow.tx.unitClosure.delete({ where: { id: closure.id } });
    await uow.audit.record({
      action: "DELETE",
      entityType: "unit_closure",
      entityId: closure.id,
      summary: "Fechamento removido",
      changes: {
        startsOn: { before: fromDbDate(closure.startsOn), after: null },
        endsOn: { before: fromDbDate(closure.endsOn), after: null },
        reason: { before: closure.reason, after: null },
      },
      metadata: { unitId: closure.unitId },
    });
    return ok({});
  });
}
