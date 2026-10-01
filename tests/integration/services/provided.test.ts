import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  createCategoryOrThrow,
  createServiceOrThrow,
  createUnitWithRooms,
  serviceInput,
  servicesContext,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

describe("provided to other features", () => {
  it("F03→F04/F06/F09/F10: listActiveServices returns only active services with booking fields", async () => {
    const ctx = await servicesContext();
    const consultas = await createCategoryOrThrow(ctx, "Consultas");
    const terapias = await createCategoryOrThrow(ctx, "Terapias");
    const massagem = await createServiceOrThrow(ctx, terapias, {
      name: "Massagem",
      durationMinutes: 50,
      priceCents: 15000,
      color: "emerald",
      requiresRoom: true,
    });
    const retorno = await createServiceOrThrow(ctx, consultas, { name: "Retorno", priceCents: 0 });
    const antigo = await createServiceOrThrow(ctx, consultas, { name: "Antigo" });
    await services.setServiceActive(ctx, { serviceId: antigo, active: false });

    const result = await services.listActiveServices(ctx);
    expect(result.ok && result.value).toEqual([
      {
        id: retorno,
        name: "Retorno",
        categoryId: consultas,
        categoryName: "Consultas",
        durationMinutes: 30,
        priceCents: 0,
        color: "blue",
        requiresRoom: false,
      },
      {
        id: massagem,
        name: "Massagem",
        categoryId: terapias,
        categoryName: "Terapias",
        durationMinutes: 50,
        priceCents: 15000,
        color: "emerald",
        requiresRoom: true,
      },
    ]);
  });

  it("F03→F06: a price change affects only the price read for new bookings", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const serviceId = await createServiceOrThrow(ctx, categoryId, { priceCents: 18000 });
    const snapshotAtBooking = await services.getService(ctx, serviceId);

    await services.updateService(ctx, {
      ...serviceInput(categoryId, { priceCents: 20000 }),
      serviceId,
      version: 1,
    });
    const afterChange = await services.getService(ctx, serviceId);
    expect(snapshotAtBooking.ok && snapshotAtBooking.value.priceCents).toBe(18000);
    expect(afterChange.ok && afterChange.value.priceCents).toBe(20000);
    const history = await services.listPriceHistory(ctx, serviceId);
    expect(history.ok && history.value.map((change) => change.priceCents)).toEqual([20000, 18000]);
  });

  it("F03→F06: getAllowedRooms resolves rooms per unit", async () => {
    const ctx = await servicesContext();
    const categoryId = await createCategoryOrThrow(ctx);
    const centro = await createUnitWithRooms(ctx, "Unidade Centro", ["Sala 1", "Sala 2", "Sala 3"]);
    const norte = await createUnitWithRooms(ctx, "Unidade Norte", ["Sala A"]);
    const [sala1, sala2] = centro.roomIds;

    const teleconsulta = await createServiceOrThrow(ctx, categoryId, { name: "Teleconsulta" });
    const qualquer = await createServiceOrThrow(ctx, categoryId, { name: "Curativo", requiresRoom: true });
    const laser = await createServiceOrThrow(ctx, categoryId, {
      name: "Laser",
      requiresRoom: true,
      allowedRoomIds: [sala1, sala2],
    });

    expect(await services.getAllowedRooms(ctx, teleconsulta, centro.unitId)).toEqual({
      ok: true,
      value: { requiresRoom: false },
    });
    expect(await services.getAllowedRooms(ctx, qualquer, centro.unitId)).toEqual({
      ok: true,
      value: { requiresRoom: true, rooms: "any" },
    });
    expect(await services.getAllowedRooms(ctx, laser, norte.unitId)).toEqual({
      ok: true,
      value: { requiresRoom: true, rooms: "any" },
    });

    // A room deactivated in F02 stays linked but is no longer offered.
    await units.setRoomActive(ctx, { roomId: sala2 ?? "", active: false });
    expect(await services.getAllowedRooms(ctx, laser, centro.unitId)).toEqual({
      ok: true,
      value: { requiresRoom: true, rooms: [{ id: sala1, name: "Sala 1" }] },
    });
    await units.setRoomActive(ctx, { roomId: sala1 ?? "", active: false });
    expect(await services.getAllowedRooms(ctx, laser, centro.unitId)).toEqual({
      ok: true,
      value: { requiresRoom: true, rooms: [] },
    });
  });
});
