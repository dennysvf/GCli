import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { services, SERVICES_DEACTIVATED_WITH_APPOINTMENTS } from "@/modules/services";
import { db } from "@/shared/db/client";
import { interpolate } from "@/shared/kernel/action-result";
import { newId } from "@/shared/kernel/ids";
import { auditEvents, closeHelpers, errorText, resetDatabase } from "../helpers";
import {
  brl,
  createCategoryOrThrow,
  createServiceOrThrow,
  createUnitWithRooms,
  serviceInput,
  servicesContext,
} from "./support";

beforeEach(resetDatabase);
afterEach(() => {
  services.registerScheduledServiceAppointments(null);
  services.registerServiceProfessionals(null);
});
afterAll(closeHelpers);

const DURATION_MESSAGE = "services.validation.duration";
const PRICE_MESSAGE = "services.validation.priceRange?max=99999.99&currency=BRL";

describe("services", () => {
  it("F03: a service is saved only with a valid duration and price", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const valid = [
      { durationMinutes: 5, prices: brl(0) },
      { durationMinutes: 480, prices: brl(9_999_999) },
    ];
    for (const [index, values] of valid.entries()) {
      const result = await services.createService(
        ctx,
        serviceInput(categoryId, { ...values, name: `S${index}` }),
      );
      expect(result.ok).toBe(true);
    }
    for (const durationMinutes of [3, 485, 7]) {
      const result = await services.createService(
        ctx,
        serviceInput(categoryId, { durationMinutes, name: "X" }),
      );
      expect(!result.ok && result.error).toMatchObject({
        code: "VALIDATION_FAILED",
        fields: { durationMinutes: DURATION_MESSAGE },
      });
    }
    for (const amountMinor of [-1, 10_000_000]) {
      const result = await services.createService(
        ctx,
        serviceInput(categoryId, { prices: [{ currency: "BRL", amountMinor }], name: "Y" }),
      );
      expect(!result.ok && result.error).toMatchObject({
        code: "VALIDATION_FAILED",
        fields: { "prices.0.amountMinor": PRICE_MESSAGE },
      });
    }
    expect(await db().service.count()).toBe(2);
  });

  it("F03: the database rejects invalid durations, prices and colors", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const base = {
      organizationId: ctx.organizationId,
      categoryId,
      name: "Direto",
      durationMinutes: 30,
      color: "blue",
    };
    await expect(
      db().service.create({ data: { ...base, id: newId(), durationMinutes: 7 } }),
    ).rejects.toThrow();
    await expect(db().service.create({ data: { ...base, id: newId(), color: "brown" } })).rejects.toThrow();
    // The price lives in service_price: negative amounts and unknown currencies are rejected.
    const serviceId = await createServiceOrThrow(ctx, categoryId, { name: "Com preço" });
    const price = { serviceId, organizationId: ctx.organizationId };
    await expect(
      db().servicePrice.create({ data: { ...price, currency: "EUR", amountMinor: -1n } }),
    ).rejects.toThrow();
    await expect(
      db().servicePrice.create({ data: { ...price, currency: "XXX", amountMinor: 100n } }),
    ).rejects.toThrow();
  });

  it("F03: a price change creates a history entry and keeps earlier prices", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx, "Procedimentos");
    const serviceId = await createServiceOrThrow(ctx, categoryId, {
      name: "Limpeza de pele",
      prices: brl(18000),
    });

    const unchanged = await services.updateService(ctx, {
      ...serviceInput(categoryId, { name: "Limpeza de pele", prices: brl(18000), durationMinutes: 60 }),
      serviceId,
      version: 1,
    });
    expect(unchanged.ok && unchanged.value).toEqual({ serviceId, version: 2, priceChanged: false });

    const changed = await services.updateService(ctx, {
      ...serviceInput(categoryId, { name: "Limpeza de pele", prices: brl(20000), durationMinutes: 60 }),
      serviceId,
      version: 2,
    });
    expect(changed.ok && changed.value).toEqual({ serviceId, version: 3, priceChanged: true });

    const history = await services.listPriceHistory(ctx, serviceId);
    expect(history.ok && history.value).toMatchObject([
      {
        currency: "BRL",
        previousAmountMinor: 18000,
        amountMinor: 20000,
        changedBy: { id: ctx.user.id, name: "Ana Souza" },
      },
      {
        currency: "BRL",
        previousAmountMinor: null,
        amountMinor: 18000,
        changedBy: { id: ctx.user.id, name: "Ana Souza" },
      },
    ]);
    const service = await services.getService(ctx, serviceId);
    expect(service.ok && service.value.prices).toEqual(brl(20000));

    const [, priceUpdate] = await auditEvents({ action: "UPDATE", entityId: serviceId });
    expect(priceUpdate?.changes).toMatchObject({ prices: { before: "BRL 18000", after: "BRL 20000" } });
    expect((await auditEvents({ action: "CREATE", entityId: serviceId })).length).toBe(1);
  });

  it("F03: price history cannot be changed by the application role", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    await createServiceOrThrow(ctx, categoryId);
    const app = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      await expect(app.query("UPDATE service_price_change SET amount_minor = 1")).rejects.toThrow(
        /permission denied/,
      );
      await expect(app.query("DELETE FROM service_price_change")).rejects.toThrow(/permission denied/);
    } finally {
      await app.end();
    }
    expect(await db().servicePriceChange.count()).toBe(1);
  });

  it("F03: a deactivated service is not offered for booking but stays readable", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const kept = await createServiceOrThrow(ctx, categoryId, { name: "Retorno", prices: brl(0) });
    const retired = await createServiceOrThrow(ctx, categoryId, { name: "Consulta antiga" });
    expect((await services.setServiceActive(ctx, { serviceId: retired, active: false })).ok).toBe(true);

    const active = await services.listActiveServices(ctx);
    expect(active.ok && active.value.map((service) => service.id)).toEqual([kept]);
    const read = await services.getService(ctx, retired);
    expect(read.ok && read.value).toMatchObject({ id: retired, active: false });
    const inactive = await services.listServices(ctx, { status: "inactive" });
    expect(inactive.ok && inactive.value.groups.flatMap((group) => group.services.map((s) => s.id))).toEqual([
      retired,
    ]);
  });

  it("F03: deactivating reports the future appointments that were kept", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const serviceId = await createServiceOrThrow(ctx, categoryId);
    services.registerScheduledServiceAppointments({ countFuture: async () => 12 });

    const result = await services.setServiceActive(ctx, { serviceId, active: false });
    expect(result.ok && result.value).toEqual({ active: false, futureAppointments: 12 });
    expect(interpolate(SERVICES_DEACTIVATED_WITH_APPOINTMENTS, { count: 12 })).toBe(
      "12 agendamentos futuros deste serviço foram mantidos.",
    );
    expect((await db().service.findUniqueOrThrow({ where: { id: serviceId } })).active).toBe(false);
  });

  it("F03: requires-room services keep their allowed rooms; others store none", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const { roomIds } = await createUnitWithRooms(ctx, "Unidade Centro", ["Sala 1", "Sala 2"]);

    const noRoom = await createServiceOrThrow(ctx, categoryId, {
      name: "Teleconsulta",
      requiresRoom: false,
      allowedRoomIds: roomIds,
    });
    const withRoom = await createServiceOrThrow(ctx, categoryId, {
      name: "Laser",
      requiresRoom: true,
      allowedRoomIds: [roomIds[0]],
    });
    const first = await services.getService(ctx, noRoom);
    expect(first.ok && first.value.allowedRoomIds).toEqual([]);
    const second = await services.getService(ctx, withRoom);
    expect(second.ok && second.value).toMatchObject({ requiresRoom: true, allowedRoomIds: [roomIds[0]] });

    // Turning "requires room" off clears the list.
    const updated = await services.updateService(ctx, {
      ...serviceInput(categoryId, { name: "Laser", requiresRoom: false, allowedRoomIds: [roomIds[0]] }),
      serviceId: withRoom,
      version: 1,
    });
    expect(updated.ok).toBe(true);
    expect(await db().serviceAllowedRoom.count({ where: { serviceId: withRoom } })).toBe(0);
  });

  it("F03: allowed rooms must be active rooms of the organization", async () => {
    const ctx = await servicesContext();
    const other = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const { roomIds } = await createUnitWithRooms(ctx, "Unidade Centro", ["Sala 1", "Sala 2"]);
    const { roomIds: foreignRooms } = await createUnitWithRooms(other, "Unidade Outra", ["Sala X"]);
    const { units } = await import("@/modules/units");
    await units.setRoomActive(ctx, { roomId: roomIds[1], active: false });

    for (const allowedRoomIds of [[roomIds[1]], foreignRooms]) {
      const result = await services.createService(
        ctx,
        serviceInput(categoryId, { requiresRoom: true, allowedRoomIds }),
      );
      expect(!result.ok && result.error).toMatchObject({
        code: "SERVICES_INVALID_ROOMS",
        fields: { allowedRoomIds: "services.errors.SERVICES_INVALID_ROOMS" },
      });
    }
    expect(await db().service.count()).toBe(0);
  });

  it("F03: service names are unique regardless of case and status", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const serviceId = await createServiceOrThrow(ctx, categoryId, { name: "Consulta" });
    await services.setServiceActive(ctx, { serviceId, active: false });
    const duplicate = await services.createService(ctx, serviceInput(categoryId, { name: "consulta" }));
    expect(!duplicate.ok && duplicate.error).toMatchObject({
      code: "SERVICES_NAME_TAKEN",
      fields: { name: "services.errors.SERVICES_NAME_TAKEN" },
    });
    expect(duplicate.ok ? "" : errorText("services", duplicate.error)).toBe(
      "Já existe um serviço com este nome.",
    );
    expect(duplicate.ok ? "" : errorText("services", duplicate.error, "en")).toBe(
      "A service with this name already exists.",
    );
  });

  it("F03: the 501st active service is rejected, on create and on reactivation", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const inactiveId = await createServiceOrThrow(ctx, categoryId, { name: "Inativo" });
    await services.setServiceActive(ctx, { serviceId: inactiveId, active: false });
    await db().service.createMany({
      data: Array.from({ length: 500 }, (_, index) => ({
        id: newId(),
        organizationId: ctx.organizationId,
        categoryId,
        name: `Serviço ${index}`,
        durationMinutes: 30,
        color: "blue",
      })),
    });
    const extra = await services.createService(ctx, serviceInput(categoryId, { name: "Extra" }));
    expect(!extra.ok && extra.error.code).toBe("SERVICES_SERVICE_LIMIT");
    const reactivate = await services.setServiceActive(ctx, { serviceId: inactiveId, active: true });
    expect(!reactivate.ok && reactivate.error.code).toBe("SERVICES_SERVICE_LIMIT");
  });

  it("F03: services list filters by name, category and status and shows enabled professionals", async () => {
    const ctx = await servicesContext();
    const consultas = await createCategoryOrThrow(ctx, "Consultas");
    const terapias = await createCategoryOrThrow(ctx, "Terapias");
    await createCategoryOrThrow(ctx, "Vazia");
    const derma = await createServiceOrThrow(ctx, consultas, { name: "Consulta Dermatológica" });
    await createServiceOrThrow(ctx, consultas, { name: "Consulta Clínica" });
    const massagem = await createServiceOrThrow(ctx, terapias, { name: "Massagem" });
    await services.setServiceActive(ctx, { serviceId: massagem, active: false });
    services.registerServiceProfessionals({ countByService: async () => new Map([[derma, 3]]) });

    const all = await services.listServices(ctx, {});
    expect(all.ok && all.value.groups.map((group) => [group.category.name, group.services.length])).toEqual([
      ["Consultas", 2],
      ["Terapias", 0],
      ["Vazia", 0],
    ]);
    const search = await services.listServices(ctx, { search: "derma" });
    expect(search.ok && search.value.groups).toMatchObject([
      { category: { name: "Consultas" }, services: [{ id: derma, enabledProfessionals: 3 }] },
    ]);
    const byCategory = await services.listServices(ctx, { categoryId: terapias, status: "all" });
    expect(byCategory.ok && byCategory.value.groups).toMatchObject([
      {
        category: { name: "Terapias" },
        services: [{ id: massagem, active: false, enabledProfessionals: 0 }],
      },
    ]);
  });

  it("F03: concurrent edits are rejected with a stale version", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const serviceId = await createServiceOrThrow(ctx, categoryId, { prices: brl(1000) });
    const first = await services.updateService(ctx, {
      ...serviceInput(categoryId, { prices: brl(2000) }),
      serviceId,
      version: 1,
    });
    expect(first.ok).toBe(true);
    const stale = await services.updateService(ctx, {
      ...serviceInput(categoryId, { prices: brl(3000) }),
      serviceId,
      version: 1,
    });
    expect(!stale.ok && stale.error.code).toBe("CONFLICT_STALE_VERSION");
    expect(await db().servicePriceChange.count({ where: { serviceId } })).toBe(2);
  });

  it("F03: front desk can read services but not change them", async () => {
    const admin = await servicesContext();
    const categoryId = await createCategoryOrThrow(admin);
    const serviceId = await createServiceOrThrow(admin, categoryId);
    const frontDesk = await servicesContext("FRONT_DESK", admin.organizationId);

    expect((await services.listServices(frontDesk, {})).ok).toBe(true);
    expect((await services.getService(frontDesk, serviceId)).ok).toBe(true);
    expect((await services.listPriceHistory(frontDesk, serviceId)).ok).toBe(true);
    const writes = [
      services.createService(frontDesk, serviceInput(categoryId, { name: "Outro" })),
      services.updateService(frontDesk, { ...serviceInput(categoryId), serviceId, version: 1 }),
      services.setServiceActive(frontDesk, { serviceId, active: false }),
      services.createCategory(frontDesk, { name: "Nova" }),
      services.renameCategory(frontDesk, { categoryId, name: "Nova" }),
      services.moveCategory(frontDesk, { categoryId, direction: "down" }),
      services.deleteCategory(frontDesk, { categoryId }),
    ];
    for (const result of await Promise.all(writes)) {
      expect(!result.ok && result.error.code).toBe("AUTHZ_FORBIDDEN");
    }
  });

  it("F03: services are isolated per organization", async () => {
    const ctx = await servicesContext();
    const other = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const serviceId = await createServiceOrThrow(ctx, categoryId);

    const list = await services.listServices(other, { status: "all" });
    expect(list.ok && list.value.groups).toEqual([]);
    const read = await services.getService(other, serviceId);
    expect(!read.ok && read.error.code).toBe("SERVICES_NOT_FOUND");
    const update = await services.updateService(other, {
      ...serviceInput(categoryId),
      serviceId,
      version: 1,
    });
    expect(!update.ok && update.error.code).toBe("SERVICES_NOT_FOUND");
    const categories = await services.listCategories(other);
    expect(categories.ok && categories.value).toEqual([]);
    const useForeignCategory = await services.createService(
      other,
      serviceInput(categoryId, { name: "Outro serviço" }),
    );
    expect(!useForeignCategory.ok && useForeignCategory.error.code).toBe("SERVICES_CATEGORY_NOT_FOUND");
  });
});
