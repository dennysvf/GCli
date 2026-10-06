import { authorize } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { DEFAULT_LOCALE, isLocale } from "@/shared/i18n/locales";
import { createTranslator } from "@/shared/i18n/translator";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { DEFAULT_CATEGORY_KEYS, MAX_CATEGORIES } from "../domain/limits";
import { ServicesErrors } from "./errors";
import {
  createCategorySchema,
  deleteCategorySchema,
  moveCategorySchema,
  renameCategorySchema,
} from "./schemas";

export type CategoryItem = { id: string; name: string; sortOrder: number; serviceCount: number };

export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "P2002";
}

async function categoryNameTaken(uow: UnitOfWork, name: string, exceptId?: string): Promise<boolean> {
  const existing = await uow.tx.serviceCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!existing;
}

const ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export async function listCategories(ctx: RequestContext): Promise<Result<CategoryItem[]>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.serviceCategory.findMany({
      orderBy: ORDER,
      select: { id: true, name: true, sortOrder: true, _count: { select: { services: true } } },
    });
    return ok(rows.map(({ _count, ...category }) => ({ ...category, serviceCount: _count.services })));
  });
}

export async function createCategory(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ categoryId: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createCategorySchema, input);
  if (!parsed.ok) return parsed;
  const { name } = parsed.value;

  try {
    return await withTransaction(ctx, async (uow) => {
      if ((await uow.tx.serviceCategory.count()) >= MAX_CATEGORIES)
        return fail(ServicesErrors.categoryLimit());
      if (await categoryNameTaken(uow, name)) return fail(ServicesErrors.categoryNameTaken());
      const last = await uow.tx.serviceCategory.aggregate({ _max: { sortOrder: true } });
      const id = newId();
      const sortOrder = (last._max.sortOrder ?? 0) + 1;
      await uow.tx.serviceCategory.create({
        data: { id, organizationId: ctx.organizationId, name, sortOrder, createdById: ctx.user.id },
      });
      await uow.audit.record({
        action: "CREATE",
        entityType: "service_category",
        entityId: id,
        summary: "Categoria de serviço criada",
        changes: diffChanges(null, { name, sortOrder }),
      });
      return ok({ categoryId: id });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(ServicesErrors.categoryNameTaken());
    throw error;
  }
}

export async function renameCategory(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ categoryId: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(renameCategorySchema, input);
  if (!parsed.ok) return parsed;
  const { categoryId, name } = parsed.value;

  try {
    return await withTransaction(ctx, async (uow) => {
      const before = await uow.tx.serviceCategory.findFirst({ where: { id: categoryId } });
      if (!before) return fail(ServicesErrors.categoryNotFound());
      if (await categoryNameTaken(uow, name, categoryId)) return fail(ServicesErrors.categoryNameTaken());
      await uow.tx.serviceCategory.update({
        where: { id: categoryId },
        data: { name, version: { increment: 1 }, updatedById: ctx.user.id },
      });
      await uow.audit.record({
        action: "UPDATE",
        entityType: "service_category",
        entityId: categoryId,
        summary: "Categoria de serviço renomeada",
        changes: diffChanges(before, { name }),
      });
      return ok({ categoryId });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(ServicesErrors.categoryNameTaken());
    throw error;
  }
}

// Moves a category one position; the whole list is renumbered 1..n so gaps and ties never pile up.
export async function moveCategory(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ categoryId: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(moveCategorySchema, input);
  if (!parsed.ok) return parsed;
  const { categoryId, direction } = parsed.value;

  return withTransaction(ctx, async (uow) => {
    const categories = await uow.tx.serviceCategory.findMany({
      orderBy: ORDER,
      select: { id: true, sortOrder: true },
    });
    const current = categories.find((category) => category.id === categoryId);
    if (!current) return fail(ServicesErrors.categoryNotFound());
    const index = categories.indexOf(current);
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= categories.length) return ok({ categoryId });

    const reordered = categories.filter((category) => category !== current);
    reordered.splice(target, 0, current);
    for (const [position, category] of reordered.entries()) {
      if (category.sortOrder === position + 1) continue;
      await uow.tx.serviceCategory.update({
        where: { id: category.id },
        data: { sortOrder: position + 1, updatedById: ctx.user.id },
      });
    }
    await uow.audit.record({
      action: "UPDATE",
      entityType: "service_category",
      entityId: categoryId,
      summary: direction === "up" ? "Categoria movida para cima" : "Categoria movida para baixo",
      changes: { sortOrder: { before: index + 1, after: target + 1 } },
    });
    return ok({ categoryId });
  });
}

export async function deleteCategory(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ categoryId: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(deleteCategorySchema, input);
  if (!parsed.ok) return parsed;
  const { categoryId } = parsed.value;

  return withTransaction(ctx, async (uow) => {
    const category = await uow.tx.serviceCategory.findFirst({ where: { id: categoryId } });
    if (!category) return fail(ServicesErrors.categoryNotFound());
    // Inactive services count too: they keep their category for history (spec F03 section 3).
    const services = await uow.tx.service.count({ where: { categoryId } });
    if (services > 0) return fail(ServicesErrors.categoryInUse(services));
    await uow.tx.serviceCategory.delete({ where: { id: categoryId } });
    await uow.audit.record({
      action: "DELETE",
      entityType: "service_category",
      entityId: categoryId,
      summary: "Categoria de serviço excluída",
      changes: { name: { before: category.name, after: null } },
    });
    return ok({ categoryId });
  });
}

// Runs inside the transaction that creates the organization (OrganizationCreated subscriber).
export async function seedDefaultCategories(uow: UnitOfWork, organizationId: string): Promise<void> {
  if ((await uow.tx.serviceCategory.count()) > 0) return;
  // The names are created in the organization's default language (PRD F16) and are clinic data after that.
  const organization = await uow.tx.organization.findFirst({ select: { defaultLocale: true } });
  const t = createTranslator(
    isLocale(organization?.defaultLocale) ? organization.defaultLocale : DEFAULT_LOCALE,
  );
  for (const [index, key] of DEFAULT_CATEGORY_KEYS.entries()) {
    const name = t(`services.defaultCategories.${key}`);
    const id = newId();
    await uow.tx.serviceCategory.create({ data: { id, organizationId, name, sortOrder: index + 1 } });
    await uow.audit.record({
      action: "CREATE",
      entityType: "service_category",
      entityId: id,
      summary: "Categoria de serviço padrão criada",
      changes: diffChanges(null, { name, sortOrder: index + 1 }),
    });
  }
}
