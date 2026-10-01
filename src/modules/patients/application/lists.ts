import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { MAX_ACTIVE_REFERRAL_SOURCES, MAX_ACTIVE_TAGS } from "../domain/limits";
import { PatientsErrors } from "./errors";
import {
  createListItemSchema,
  renameListItemSchema,
  setListItemActiveSchema,
  type ListKind,
} from "./schemas";

// Configurable lists of PRD F05: referral sources and tags. Items are deactivated, never deleted,
// so patients that use them keep showing them.
export type ListItem = { id: string; name: string; active: boolean };

const LIMITS: Record<ListKind, number> = {
  "referral-source": MAX_ACTIVE_REFERRAL_SOURCES,
  tag: MAX_ACTIVE_TAGS,
};
const ENTITY: Record<ListKind, string> = { "referral-source": "referral_source", tag: "tag" };

// Both tables have the same shape; this keeps one code path for the two lists.
function table(uow: UnitOfWork, list: ListKind) {
  const delegate = list === "tag" ? uow.tx.tag : uow.tx.referralSource;
  return delegate as unknown as typeof uow.tx.tag;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "P2002";
}

async function nameTaken(uow: UnitOfWork, list: ListKind, name: string, exceptId?: string) {
  const found = await table(uow, list).findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!found;
}

export async function listItems(
  ctx: RequestContext,
  list: ListKind,
  options: { activeOnly?: boolean } = {},
): Promise<Result<ListItem[]>> {
  const allowed = await authorize(ctx, "patient:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) =>
    ok(
      await table(uow, list).findMany({
        where: options.activeOnly ? { active: true } : {},
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, active: true },
      }),
    ),
  );
}

export async function createListItem(ctx: RequestContext, input: unknown): Promise<Result<{ id: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createListItemSchema, input);
  if (!parsed.ok) return parsed;
  const { list, name } = parsed.value;
  try {
    return await withTransaction(ctx, async (uow) => {
      const items = table(uow, list);
      if ((await items.count({ where: { active: true } })) >= LIMITS[list]) {
        return fail(PatientsErrors.listLimit(LIMITS[list]));
      }
      if (await nameTaken(uow, list, name)) return fail(PatientsErrors.listNameTaken());
      const last = await items.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      const id = newId();
      await items.create({
        data: { id, organizationId: ctx.organizationId, name, sortOrder: (last?.sortOrder ?? 0) + 1 },
      });
      await uow.audit.record({
        action: "CREATE",
        entityType: ENTITY[list],
        entityId: id,
        summary: list === "tag" ? "Etiqueta criada" : "Origem criada",
        changes: { name: { before: null, after: name } },
      });
      return ok({ id });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(PatientsErrors.listNameTaken());
    throw error;
  }
}

export async function renameListItem(ctx: RequestContext, input: unknown): Promise<Result<{ id: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(renameListItemSchema, input);
  if (!parsed.ok) return parsed;
  const { list, id, name } = parsed.value;
  try {
    return await withTransaction(ctx, async (uow) => {
      const before = await table(uow, list).findFirst({ where: { id } });
      if (!before) return fail(PatientsErrors.notFound());
      if (await nameTaken(uow, list, name, id)) return fail(PatientsErrors.listNameTaken());
      await table(uow, list).update({ where: { id }, data: { name } });
      await uow.audit.record({
        action: "UPDATE",
        entityType: ENTITY[list],
        entityId: id,
        summary: list === "tag" ? "Etiqueta renomeada" : "Origem renomeada",
        changes: { name: { before: before.name, after: name } },
      });
      return ok({ id });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(PatientsErrors.listNameTaken());
    throw error;
  }
}

export async function setListItemActive(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ active: boolean }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setListItemActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { list, id, active } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    const items = table(uow, list);
    const item = await items.findFirst({ where: { id } });
    if (!item) return fail(PatientsErrors.notFound());
    if (item.active === active) return ok({ active });
    if (active && (await items.count({ where: { active: true } })) >= LIMITS[list]) {
      return fail(PatientsErrors.listLimit(LIMITS[list]));
    }
    await items.update({ where: { id }, data: { active } });
    await uow.audit.record({
      action: "UPDATE",
      entityType: ENTITY[list],
      entityId: id,
      summary: active ? "Item da lista reativado" : "Item da lista desativado",
      changes: { active: { before: !active, after: active } },
    });
    return ok({ active });
  });
}
