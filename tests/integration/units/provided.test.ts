import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { units } from "@/modules/units";
import { closeHelpers, resetDatabase } from "../helpers";
import { createUnitOrThrow, fullWeek, isoDaysFromToday, managerContext } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

describe("provided to other features", () => {
  it("F02→F04/F06: getUnitSchedule returns hours, closures, rooms and time zone", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx, { timeZone: "America/Manaus" });
    await units.replaceBusinessHours(ctx, {
      unitId,
      days: fullWeek([{ weekday: 3, intervals: [{ start: 480, end: 1080 }] }]),
    });
    const room = await units.createRoom(ctx, { unitId, name: "Sala 1" });
    const closedDay = isoDaysFromToday(7, "America/Manaus");
    await units.createClosure(ctx, { unitId, startsOn: closedDay, endsOn: closedDay, reason: "Feriado" });

    const schedule = await units.getUnitSchedule(ctx, unitId);
    expect(schedule.ok && schedule.value).toMatchObject({
      unitId,
      timeZone: "America/Manaus",
      active: true,
      closures: [{ startsOn: closedDay, endsOn: closedDay, reason: "Feriado" }],
      rooms: [{ id: room.ok ? room.value.roomId : "", name: "Sala 1", active: true }],
    });
    expect(schedule.ok && schedule.value.businessHours[2]).toEqual({
      weekday: 3,
      open: true,
      intervals: [{ start: 480, end: 1080 }],
    });
  });

  it("F02→F08: getUnitContact returns name, address and phone", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    const contact = await units.getUnitContact(ctx, unitId);
    expect(contact.ok && contact.value).toMatchObject({
      name: "Unidade Centro",
      phone: "1133334444",
      formattedAddress: "Avenida Paulista, 1000 - Sala 12 - Bela Vista, São Paulo/SP - CEP 01310-100",
    });
  });

  it("F02→F11: listUnits provides the active units for cash registers", async () => {
    const ctx = await managerContext();
    const norte = await createUnitOrThrow(ctx, { name: "Unidade Norte" });
    const centro = await createUnitOrThrow(ctx);
    const inactive = await createUnitOrThrow(ctx, { name: "Unidade Antiga" });
    await units.setUnitActive(ctx, { unitId: inactive, active: false });
    const list = await units.listUnits(ctx, { activeOnly: true });
    expect(list.ok && list.value.map((unit) => unit.id)).toEqual([centro, norte]);
  });
});
