import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { CashErrors } from "../domain/errors";
import type { CashDeps, CategoryRecord } from "./ports";
import { saveCategorySchema, setCategoryActiveSchema } from "./schemas";
import { authorizeAny } from "./support";

// PRD F11: the default categories of an organization. Names are data the manager edits, so they are
// seeded in pt-BR (the source language) and can be renamed.
const DEFAULT_EXPENSE_CATEGORIES = [
  "Aluguel",
  "Salários",
  "Materiais",
  "Utilidades",
  "Marketing",
  "Impostos",
  "Serviços de terceiros",
  "Outros",
] as const;
const DEFAULT_REVENUE_CATEGORIES = ["Aluguel de sala", "Venda de produtos", "Outros"] as const;
// The system category for moving cash in and out of the drawer: it counts in the expected cash and
// stays out of the statement (spec F11 section 3).
export const TRANSFER_CATEGORY_NAME = "Transferência";

// Lists the categories; the first read of an organization creates the defaults.
export async function listCategories(deps: CashDeps, ctx: RequestContext): Promise<Result<CategoryRecord[]>> {
  const allowed = await authorizeAny(ctx, ["cash:operate", "finance:manage"]);
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const existing = await deps.reads.categories(uow);
    if (existing.length > 0) return ok(existing);
    await uow.tx.financialCategory.createMany({
      data: [
        ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ kind: "EXPENSE", name, system: false })),
        ...DEFAULT_REVENUE_CATEGORIES.map((name) => ({ kind: "REVENUE", name, system: false })),
        { kind: "TRANSFER", name: TRANSFER_CATEGORY_NAME, system: true },
      ].map((row) => ({ ...row, id: deps.newId(), organizationId: ctx.organizationId })),
      skipDuplicates: true,
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "financial_category",
      summary: "Categorias financeiras padrão criadas",
    });
    return ok(await deps.reads.categories(uow));
  });
}

export async function saveCategory(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<CategoryRecord>> {
  const allowed = await authorize(ctx, "finance:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(saveCategorySchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const listed = await listCategories(deps, ctx);
  if (!listed.ok) return listed;
  return withTransaction(ctx, async (uow) => {
    const taken = listed.value.some(
      (category) =>
        category.id !== data.categoryId &&
        category.kind === data.kind &&
        category.name.toLowerCase() === data.name.toLowerCase(),
    );
    if (taken) return fail(CashErrors.categoryNameTaken());
    if (data.categoryId) {
      const current = listed.value.find((category) => category.id === data.categoryId);
      if (!current) return fail(CashErrors.categoryNotFound());
      if (current.system) return fail(CashErrors.categorySystem());
      await uow.tx.financialCategory.updateMany({ where: { id: current.id }, data: { name: data.name } });
      await uow.audit.record({
        action: "UPDATE",
        entityType: "financial_category",
        entityId: current.id,
        summary: "Categoria financeira renomeada",
        changes: { name: { before: current.name, after: data.name } },
      });
      return ok({ ...current, name: data.name });
    }
    const id = deps.newId();
    await uow.tx.financialCategory.create({
      data: { id, organizationId: ctx.organizationId, kind: data.kind, name: data.name, system: false },
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "financial_category",
      entityId: id,
      summary: "Categoria financeira criada",
      metadata: { kind: data.kind },
    });
    return ok({ id, kind: data.kind, name: data.name, system: false, active: true });
  });
}

export async function setCategoryActive(
  deps: CashDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ active: boolean }>> {
  const allowed = await authorize(ctx, "finance:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setCategoryActiveSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  return withTransaction(ctx, async (uow) => {
    const category = await deps.reads.category(uow, data.categoryId);
    if (!category) return fail(CashErrors.categoryNotFound());
    if (category.system) return fail(CashErrors.categorySystem());
    await uow.tx.financialCategory.updateMany({ where: { id: category.id }, data: { active: data.active } });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "financial_category",
      entityId: category.id,
      summary: data.active ? "Categoria financeira ativada" : "Categoria financeira desativada",
      changes: { active: { before: category.active, after: data.active } },
    });
    return ok({ active: data.active });
  });
}
