import { recordDenial } from "@/shared/authz/guard";
import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { createTranslator } from "@/shared/i18n/translator";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { DEFAULT_CATEGORIES, ISSUED_CATEGORY_KEY } from "../domain/categories";
import { DocumentsErrors } from "../domain/errors";
import { MAX_ACTIVE_CATEGORIES } from "../domain/limits";
import {
  createCategorySchema,
  listCategoriesSchema,
  setCategoryActiveSchema,
  updateCategorySchema,
} from "./schemas";
import { isUniqueViolation, organizationLocale } from "./support";

// Document categories (PRD F08 Capabilities): configurable, each with a clinical flag. They are
// deactivated, never deleted, so documents keep theirs.

export type CategoryItem = {
  id: string;
  name: string;
  clinical: boolean;
  active: boolean;
  // "Documento emitido": used by generated documents, cannot be changed.
  system: boolean;
  version: number;
  // Only for those who manage categories.
  documentCount: number | null;
};

const ORDER = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

// Created on first use, in the organization's default language. The unique key of the default
// rows and ON CONFLICT DO NOTHING make two first uses at once safe.
export async function ensureDefaultCategories(uow: UnitOfWork, organizationId: string): Promise<void> {
  const total = DEFAULT_CATEGORIES.length + 1;
  if ((await uow.tx.documentCategory.count({ where: { systemKey: { not: null } } })) >= total) return;
  const t = createTranslator(await organizationLocale(uow));
  const created = await uow.tx.documentCategory.createMany({
    data: [
      ...DEFAULT_CATEGORIES.map((category, index) => ({
        id: newId(),
        organizationId,
        name: t(`documents.defaults.categories.${category.key}`),
        isClinical: category.clinical,
        systemKey: category.key,
        sortOrder: index + 1,
      })),
      {
        id: newId(),
        organizationId,
        name: t(`documents.defaults.categories.${ISSUED_CATEGORY_KEY}`),
        isClinical: false,
        systemKey: ISSUED_CATEGORY_KEY,
        sortOrder: 100,
      },
    ],
    skipDuplicates: true,
  });
  if (created.count > 0) {
    await uow.audit.record({
      action: "CREATE",
      entityType: "document_category",
      summary: "Categorias de documento padrão criadas",
      metadata: { count: created.count },
    });
  }
}

export async function listCategories(
  ctx: RequestContext,
  input: unknown = {},
): Promise<Result<CategoryItem[]>> {
  const manages = can(ctx, "setup:manage");
  if (!manages && !can(ctx, "document:upload") && !can(ctx, "document:read")) {
    await recordDenial(ctx, "document:read");
    return fail(CommonErrors.forbidden());
  }
  const parsed = parseInput(listCategoriesSchema, input);
  if (!parsed.ok) return parsed;
  // Inactive categories are for the settings page only.
  const includeInactive = manages && parsed.value.includeInactive;
  return withTransaction(ctx, async (uow) => {
    await ensureDefaultCategories(uow, ctx.organizationId);
    const rows = await uow.tx.documentCategory.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: ORDER,
    });
    const counts = manages
      ? await uow.tx.patientDocument.groupBy({ by: ["categoryId"], _count: { _all: true } })
      : [];
    const countOf = new Map(counts.map((row) => [row.categoryId, row._count._all]));
    return ok(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        clinical: row.isClinical,
        active: row.active,
        system: row.systemKey === ISSUED_CATEGORY_KEY,
        version: row.version,
        documentCount: manages ? (countOf.get(row.id) ?? 0) : null,
      })),
    );
  });
}

async function nameTaken(uow: UnitOfWork, name: string, exceptId?: string): Promise<boolean> {
  const existing = await uow.tx.documentCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!existing;
}

export async function createCategory(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ categoryId: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createCategorySchema, input);
  if (!parsed.ok) return parsed;
  const { name, clinical } = parsed.value;
  try {
    return await withTransaction(ctx, async (uow) => {
      await ensureDefaultCategories(uow, ctx.organizationId);
      if ((await uow.tx.documentCategory.count({ where: { active: true } })) >= MAX_ACTIVE_CATEGORIES) {
        return fail(DocumentsErrors.categoryLimit());
      }
      if (await nameTaken(uow, name)) return fail(DocumentsErrors.categoryNameTaken());
      const id = newId();
      const last = await uow.tx.documentCategory.aggregate({
        where: { systemKey: null },
        _max: { sortOrder: true },
      });
      const sortOrder = Math.max(last._max.sortOrder ?? 0, DEFAULT_CATEGORIES.length) + 1;
      await uow.tx.documentCategory.create({
        data: { id, organizationId: ctx.organizationId, name, isClinical: clinical, sortOrder },
      });
      await uow.audit.record({
        action: "CREATE",
        entityType: "document_category",
        entityId: id,
        summary: "Categoria de documento criada",
        changes: diffChanges(null, { name, clinical }),
      });
      return ok({ categoryId: id });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(DocumentsErrors.categoryNameTaken());
    throw error;
  }
}

// Renames a category and changes its clinical flag. Turning the flag on makes the documents the
// category already has clinical, in the same transaction; turning it off only affects new uploads
// (PRD F08: the flag of a document never goes off).
export async function updateCategory(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number; documentsMadeClinical: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateCategorySchema, input);
  if (!parsed.ok) return parsed;
  const { categoryId, name, clinical, version } = parsed.value;
  try {
    return await withTransaction(ctx, async (uow) => {
      const before = await uow.tx.documentCategory.findFirst({ where: { id: categoryId } });
      if (!before) return fail(DocumentsErrors.categoryInvalid());
      if (before.systemKey === ISSUED_CATEGORY_KEY) return fail(DocumentsErrors.categorySystem());
      if (await nameTaken(uow, name, categoryId)) return fail(DocumentsErrors.categoryNameTaken());
      const updated = await uow.tx.documentCategory.updateMany({
        where: { id: categoryId, version },
        data: { name, isClinical: clinical, version: { increment: 1 } },
      });
      if (updated.count === 0) return fail(DocumentsErrors.stale());
      const turnsClinicalOn = clinical && !before.isClinical;
      const documentsMadeClinical = turnsClinicalOn
        ? (
            await uow.tx.patientDocument.updateMany({
              where: { categoryId, isClinical: false },
              data: { isClinical: true },
            })
          ).count
        : 0;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "document_category",
        entityId: categoryId,
        summary: "Categoria de documento atualizada",
        changes: diffChanges({ name: before.name, clinical: before.isClinical }, { name, clinical }),
        metadata: { documentsMadeClinical },
      });
      return ok({ version: version + 1, documentsMadeClinical });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(DocumentsErrors.categoryNameTaken());
    throw error;
  }
}

export async function setCategoryActive(
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setCategoryActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { categoryId, active, version } = parsed.value;
  return withTransaction(ctx, async (uow) => {
    const before = await uow.tx.documentCategory.findFirst({ where: { id: categoryId } });
    if (!before) return fail(DocumentsErrors.categoryInvalid());
    if (before.systemKey === ISSUED_CATEGORY_KEY) return fail(DocumentsErrors.categorySystem());
    if (active && !before.active) {
      const activeCount = await uow.tx.documentCategory.count({ where: { active: true } });
      if (activeCount >= MAX_ACTIVE_CATEGORIES) return fail(DocumentsErrors.categoryLimit());
    }
    const updated = await uow.tx.documentCategory.updateMany({
      where: { id: categoryId, version },
      data: { active, version: { increment: 1 } },
    });
    if (updated.count === 0) return fail(DocumentsErrors.stale());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "document_category",
      entityId: categoryId,
      summary: active ? "Categoria de documento ativada" : "Categoria de documento desativada",
      changes: diffChanges({ active: before.active }, { active }),
    });
    return ok({ version: version + 1 });
  });
}
