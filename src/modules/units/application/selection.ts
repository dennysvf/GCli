import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { UnitsErrors } from "./errors";
import { selectUnitSchema } from "./schemas";

export type SelectedUnit = { id: string; name: string; timeZone: string };

// The unit chosen in the header (PRD F02: remembered per user). When the stored unit is missing
// or inactive, the first active unit by name is used; null when there are no active units.
export async function getSelectedUnit(ctx: RequestContext): Promise<SelectedUnit | null> {
  const result = await withTransaction(ctx, async (uow) => {
    const select = { id: true, name: true, timeZone: true } as const;
    const stored = await uow.tx.unitSelection.findFirst({
      where: { userId: ctx.user.id },
      select: { unit: { select: { ...select, active: true } } },
    });
    if (stored?.unit.active) {
      return ok({ id: stored.unit.id, name: stored.unit.name, timeZone: stored.unit.timeZone });
    }
    return ok(await uow.tx.unit.findFirst({ where: { active: true }, orderBy: { name: "asc" }, select }));
  });
  return result.ok ? result.value : null;
}

// A preference, not a business change: not audited.
export async function selectUnit(ctx: RequestContext, input: unknown): Promise<Result<{ unitId: string }>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(selectUnitSchema, input);
  if (!parsed.ok) return parsed;
  const { unitId } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    const unit = await uow.tx.unit.findFirst({ where: { id: unitId, active: true }, select: { id: true } });
    if (!unit) return fail(UnitsErrors.notFound());
    await uow.tx.unitSelection.upsert({
      where: { userId: ctx.user.id },
      create: { userId: ctx.user.id, organizationId: ctx.organizationId, unitId },
      update: { unitId },
    });
    return ok({ unitId });
  });
}
