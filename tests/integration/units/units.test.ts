import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { units } from "@/modules/units";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, createUser, resetDatabase, signedInContext } from "../helpers";
import { BASE_UNIT, createUnitOrThrow, fakeAppointments, fullWeek, managerContext } from "./support";

beforeEach(resetDatabase);
afterEach(() => units.registerScheduledAppointments(null));
afterAll(closeHelpers);

describe("units", () => {
  it("F02: administrator creates a unit with business hours and rooms", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx, { cnpj: "12.ABC.345/01DE-35" });
    const hours = await units.replaceBusinessHours(ctx, {
      unitId,
      days: fullWeek([
        {
          weekday: 1,
          intervals: [
            { start: 420, end: 720 },
            { start: 780, end: 1200 },
          ],
        },
        { weekday: 6, intervals: [{ start: 480, end: 720 }] },
      ]),
    });
    expect(hours).toEqual({ ok: true, value: { affectedAppointments: 0 } });
    expect((await units.createRoom(ctx, { unitId, name: "Sala 1" })).ok).toBe(true);
    expect((await units.createRoom(ctx, { unitId, name: "Sala 2", description: "Maca" })).ok).toBe(true);

    const unit = await units.getUnit(ctx, unitId);
    expect(unit.ok && unit.value).toMatchObject({
      name: "Unidade Centro",
      cnpj: "12ABC34501DE35",
      phone: "1133334444",
      address: { cep: "01310100", state: "SP", city: "São Paulo" },
    });
    const week = await units.getBusinessHours(ctx, unitId);
    expect(week.ok && week.value[0]?.intervals).toHaveLength(2);
    expect(week.ok && week.value[6]).toEqual({ weekday: 7, open: false, intervals: [] });
    const rooms = await units.listRooms(ctx, unitId);
    expect(rooms.ok && rooms.value.map((room) => room.name)).toEqual(["Sala 1", "Sala 2"]);
    expect((await auditEvents({ action: "CREATE", entityId: unitId })).length).toBe(1);
  });

  it("F02: unit names are unique per organization, ignoring case", async () => {
    const ctx = await managerContext();
    await createUnitOrThrow(ctx);
    const duplicate = await units.createUnit(ctx, { ...BASE_UNIT, name: "unidade centro" });
    expect(!duplicate.ok && duplicate.error.code).toBe("UNITS_NAME_TAKEN");
  });

  it("F02: invalid unit CNPJ is rejected", async () => {
    const ctx = await managerContext();
    const result = await units.createUnit(ctx, { ...BASE_UNIT, cnpj: "11.222.333/0001-82" });
    expect(!result.ok && result.error).toMatchObject({
      code: "UNITS_INVALID_CNPJ",
      fields: { cnpj: "CNPJ inválido." },
    });
  });

  it("F02: the 21st active unit is rejected, and reactivation respects the limit", async () => {
    const ctx = await managerContext();
    const ids: string[] = [];
    for (let index = 1; index <= 20; index++)
      ids.push(await createUnitOrThrow(ctx, { name: `Unidade ${index}` }));
    const extra = await units.createUnit(ctx, { ...BASE_UNIT, name: "Unidade 21" });
    expect(!extra.ok && extra.error.code).toBe("UNITS_UNIT_LIMIT");

    expect((await units.setUnitActive(ctx, { unitId: ids[0], active: false })).ok).toBe(true);
    expect((await units.createUnit(ctx, { ...BASE_UNIT, name: "Unidade 21" })).ok).toBe(true);
    const reactivate = await units.setUnitActive(ctx, { unitId: ids[0], active: true });
    expect(!reactivate.ok && reactivate.error.code).toBe("UNITS_UNIT_LIMIT");
  });

  it("F02: a unit with future appointments cannot be deactivated", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    units.registerScheduledAppointments(fakeAppointments({ countFutureInUnit: 5 }));
    const result = await units.setUnitActive(ctx, { unitId, active: false });
    expect(!result.ok && result.error).toMatchObject({
      code: "UNITS_UNIT_HAS_APPOINTMENTS",
      params: { count: 5 },
    });
  });

  it("F02: deactivated units are hidden from booking lists but remain readable", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    await createUnitOrThrow(ctx, { name: "Unidade Norte" });
    await units.setUnitActive(ctx, { unitId, active: false });
    const active = await units.listUnits(ctx, { activeOnly: true });
    expect(active.ok && active.value.map((unit) => unit.name)).toEqual(["Unidade Norte"]);
    const all = await units.listUnits(ctx);
    expect(all.ok && all.value).toHaveLength(2);
    const unit = await units.getUnit(ctx, unitId);
    expect(unit.ok && unit.value.active).toBe(false);
  });

  it("F02: a stale version is rejected on update", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    expect((await units.updateUnit(ctx, { ...BASE_UNIT, unitId, version: 1, name: "Centro" })).ok).toBe(true);
    const stale = await units.updateUnit(ctx, { ...BASE_UNIT, unitId, version: 1, name: "Outro" });
    expect(!stale.ok && stale.error.code).toBe("CONFLICT_STALE_VERSION");
  });

  it("F02: reducing business hours reports affected appointments but saves", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    units.registerScheduledAppointments(fakeAppointments({ countFutureOutsideHours: 3 }));
    const result = await units.replaceBusinessHours(ctx, {
      unitId,
      days: fullWeek([{ weekday: 1, intervals: [{ start: 480, end: 600 }] }]),
    });
    expect(result).toEqual({ ok: true, value: { affectedAppointments: 3 } });
    const week = await units.getBusinessHours(ctx, unitId);
    expect(week.ok && week.value[0]?.intervals).toEqual([{ start: 480, end: 600 }]);
  });

  it("F02: invalid business hours are rejected with field messages", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    const result = await units.replaceBusinessHours(ctx, {
      unitId,
      days: fullWeek([
        {
          weekday: 2,
          intervals: [
            { start: 480, end: 720 },
            { start: 700, end: 900 },
          ],
        },
      ]),
    });
    expect(!result.ok && result.error.code).toBe("UNITS_INVALID_HOURS");
    expect(!result.ok && result.error.fields?.["days.1"]).toContain("Terça");
  });

  it("F02: front desk can read units but not change them", async () => {
    const admin = await managerContext();
    const unitId = await createUnitOrThrow(admin);
    const desk = await createUser({ organizationId: admin.organizationId, role: "FRONT_DESK" });
    const { ctx } = await signedInContext(desk);
    expect((await units.listUnits(ctx)).ok).toBe(true);
    expect((await units.getUnit(ctx, unitId)).ok).toBe(true);
    const write = await units.updateUnit(ctx, { ...BASE_UNIT, unitId, version: 1 });
    expect(!write.ok && write.error.code).toBe("AUTHZ_FORBIDDEN");
    const room = await units.createRoom(ctx, { unitId, name: "Sala X" });
    expect(!room.ok && room.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F02: units are isolated per organization", async () => {
    const ctxA = await managerContext();
    const ctxB = await managerContext();
    const unitA = await createUnitOrThrow(ctxA);
    const listB = await units.listUnits(ctxB);
    expect(listB.ok && listB.value).toEqual([]);
    const readB = await units.getUnit(ctxB, unitA);
    expect(!readB.ok && readB.error.code).toBe("UNITS_NOT_FOUND");
    const writeB = await units.updateUnit(ctxB, {
      ...BASE_UNIT,
      unitId: unitA,
      version: 1,
      name: "Invadida",
    });
    expect(!writeB.ok && writeB.error.code).toBe("UNITS_NOT_FOUND");
    expect((await db().unit.findUniqueOrThrow({ where: { id: unitA } })).name).toBe("Unidade Centro");
  });

  it("F02: selected unit is remembered per user and falls back when deactivated", async () => {
    const ctx = await managerContext();
    const centro = await createUnitOrThrow(ctx);
    const norte = await createUnitOrThrow(ctx, { name: "Unidade Norte" });
    expect((await units.getSelectedUnit(ctx))?.id).toBe(centro);
    expect((await units.selectUnit(ctx, { unitId: norte })).ok).toBe(true);
    expect((await units.getSelectedUnit(ctx))?.id).toBe(norte);
    await units.setUnitActive(ctx, { unitId: norte, active: false });
    expect((await units.getSelectedUnit(ctx))?.id).toBe(centro);
    const inactive = await units.selectUnit(ctx, { unitId: norte });
    expect(!inactive.ok && inactive.error.code).toBe("UNITS_NOT_FOUND");
  });
});
