import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { identity } from "@/modules/identity";
import { services } from "@/modules/services";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { createCategoryOrThrow, createServiceOrThrow, servicesContext } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

describe("service categories", () => {
  it("F03: category names are unique regardless of case", async () => {
    const ctx = await servicesContext();
    await createCategoryOrThrow(ctx, "Consultas");
    const duplicate = await services.createCategory(ctx, { name: "CONSULTAS" });
    expect(!duplicate.ok && duplicate.error).toMatchObject({
      code: "SERVICES_CATEGORY_NAME_TAKEN",
      fields: { name: "services.errors.SERVICES_CATEGORY_NAME_TAKEN" },
    });
  });

  it("F03: the 51st category is rejected", async () => {
    const ctx = await servicesContext();
    await db().serviceCategory.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        id: newId(),
        organizationId: ctx.organizationId,
        name: `Categoria ${index}`,
        sortOrder: index + 1,
      })),
    });
    const extra = await services.createCategory(ctx, { name: "Extra" });
    expect(!extra.ok && extra.error.code).toBe("SERVICES_CATEGORY_LIMIT");
  });

  it("F03: a category with services cannot be deleted", async () => {
    const ctx = await servicesContext();
    const used = await createCategoryOrThrow(ctx, "Consultas");
    const empty = await createCategoryOrThrow(ctx, "Vazia");
    const serviceId = await createServiceOrThrow(ctx, used, { name: "Serviço A" });
    await createServiceOrThrow(ctx, used, { name: "Serviço B" });
    await services.setServiceActive(ctx, { serviceId, active: false });

    const blocked = await services.deleteCategory(ctx, { categoryId: used });
    expect(!blocked.ok && blocked.error).toMatchObject({
      code: "SERVICES_CATEGORY_IN_USE",
      params: { count: 2 },
    });
    expect((await services.deleteCategory(ctx, { categoryId: empty })).ok).toBe(true);
    expect(await db().serviceCategory.count()).toBe(1);
    expect((await auditEvents({ action: "DELETE", entityId: empty })).length).toBe(1);
  });

  it("F03: categories can be renamed and reordered", async () => {
    const ctx = await servicesContext();
    const consultas = await createCategoryOrThrow(ctx, "Consultas");
    const procedimentos = await createCategoryOrThrow(ctx, "Procedimentos");
    const terapias = await createCategoryOrThrow(ctx, "Terapias");
    const serviceId = await createServiceOrThrow(ctx, procedimentos);

    expect((await services.renameCategory(ctx, { categoryId: procedimentos, name: "Estética" })).ok).toBe(
      true,
    );
    expect((await services.moveCategory(ctx, { categoryId: terapias, direction: "up" })).ok).toBe(true);
    expect((await services.moveCategory(ctx, { categoryId: consultas, direction: "up" })).ok).toBe(true);

    const list = await services.listCategories(ctx);
    expect(
      list.ok && list.value.map((category) => [category.name, category.sortOrder, category.serviceCount]),
    ).toEqual([
      ["Consultas", 1, 0],
      ["Terapias", 2, 0],
      ["Estética", 3, 1],
    ]);
    const service = await services.getService(ctx, serviceId);
    expect(service.ok && service.value.categoryName).toBe("Estética");
  });

  it("F03: new organizations start with the default categories", async () => {
    const result = await identity.setupFirstAdministrator({
      organizationName: "Clínica Nova",
      adminName: "Ana Lima",
      adminEmail: "ana@clinicanova.com.br",
    });
    expect(result.ok).toBe(true);
    const organizationId = result.ok ? result.value.organizationId : "";
    const categories = await db().serviceCategory.findMany({
      where: { organizationId },
      orderBy: { sortOrder: "asc" },
    });
    expect(categories.map((category) => category.name)).toEqual(["Consultas", "Procedimentos", "Terapias"]);
    expect(
      await db().auditEvent.count({
        where: { entityType: "service_category", action: "CREATE", organizationId },
      }),
    ).toBe(3);
  });
});
