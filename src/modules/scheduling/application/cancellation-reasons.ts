import { authorize, recordDenial } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { SchedulingErrors } from "../domain/errors";
import { MAX_ACTIVE_REASONS } from "../domain/limits";
import { DEFAULT_CANCELLATION_REASONS } from "../messages";
import { createReasonSchema, renameReasonSchema, setReasonActiveSchema } from "./schemas";

// The configurable list of cancellation reasons (PRD F06: "reason from a configurable list"),
// managed like the F05 lists. Reasons are deactivated, never deleted, so cancelled appointments
// keep theirs.

export type CancellationReasonItem = { id: string; name: string; active: boolean };

// Spec F06: an organization starts with four default reasons, created on the first read.
async function ensureDefaults(ctx: RequestContext, uow: UnitOfWork): Promise<void> {
  const count = await uow.tx.cancellationReason.count({});
  if (count > 0) return;
  await uow.tx.cancellationReason.createMany({
    data: DEFAULT_CANCELLATION_REASONS.map((name, index) => ({
      id: newId(),
      organizationId: ctx.organizationId,
      name,
      sortOrder: index + 1,
    })),
    skipDuplicates: true,
  });
}

// Read by those who cancel appointments (the form lists the active ones) and those who manage
// the list.
export async function listCancellationReasons(
  ctx: RequestContext,
  options: { activeOnly?: boolean } = {},
): Promise<Result<CancellationReasonItem[]>> {
  if (!can(ctx, "schedule:manage") && !can(ctx, "setup:manage")) {
    await recordDenial(ctx, "schedule:manage");
    return fail(CommonErrors.forbidden());
  }
  return withTransaction(ctx, async (uow) => {
    await ensureDefaults(ctx, uow);
    const rows = await uow.tx.cancellationReason.findMany({
      where: options.activeOnly ? { active: true } : {},
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    });
    return ok(rows);
  });
}

export async function isActiveReason(uow: UnitOfWork, reasonId: string): Promise<boolean> {
  const row = await uow.tx.cancellationReason.findFirst({
    where: { id: reasonId, active: true },
    select: { id: true },
  });
  return row !== null;
}

async function nameTaken(uow: UnitOfWork, name: string, exceptId?: string): Promise<boolean> {
  const row = await uow.tx.cancellationReason.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return row !== null;
}

export async function createCancellationReason(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<CancellationReasonItem>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createReasonSchema, input);
  if (!parsed.ok) return parsed;
  const { name } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    await ensureDefaults(ctx, uow);
    if (await nameTaken(uow, name)) return fail(SchedulingErrors.listNameTaken());
    const active = await uow.tx.cancellationReason.count({ where: { active: true } });
    if (active >= MAX_ACTIVE_REASONS) return fail(SchedulingErrors.listLimit(MAX_ACTIVE_REASONS));
    const last = await uow.tx.cancellationReason.aggregate({ _max: { sortOrder: true } });
    const id = newId();
    await uow.tx.cancellationReason.create({
      data: { id, organizationId: ctx.organizationId, name, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "cancellation_reason",
      entityId: id,
      changes: { name: { before: null, after: name } },
    });
    return ok({ id, name, active: true });
  });
}

export async function renameCancellationReason(ctx: RequestContext, input: unknown): Promise<Result<void>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(renameReasonSchema, input);
  if (!parsed.ok) return parsed;
  const { id, name } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.cancellationReason.findFirst({ where: { id } });
    if (!row) return fail(SchedulingErrors.invalidReason());
    if (await nameTaken(uow, name, id)) return fail(SchedulingErrors.listNameTaken());
    await uow.tx.cancellationReason.updateMany({ where: { id }, data: { name } });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "cancellation_reason",
      entityId: id,
      changes: { name: { before: row.name, after: name } },
    });
    return ok(undefined);
  });
}

export async function setCancellationReasonActive(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<void>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setReasonActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { id, active } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.cancellationReason.findFirst({ where: { id } });
    if (!row) return fail(SchedulingErrors.invalidReason());
    if (row.active === active) return ok(undefined);
    if (active) {
      const count = await uow.tx.cancellationReason.count({ where: { active: true } });
      if (count >= MAX_ACTIVE_REASONS) return fail(SchedulingErrors.listLimit(MAX_ACTIVE_REASONS));
    }
    await uow.tx.cancellationReason.updateMany({ where: { id }, data: { active } });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "cancellation_reason",
      entityId: id,
      changes: { active: { before: row.active, after: active } },
    });
    return ok(undefined);
  });
}
