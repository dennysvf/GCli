import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { units } from "@/modules/units";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { createUnitOrThrow, fakeAppointments, isoDaysFromToday, managerContext } from "./support";

beforeEach(resetDatabase);
afterEach(() => units.registerScheduledAppointments(null));
afterAll(closeHelpers);

describe("rooms", () => {
  it("F02: room names are unique within the unit, ignoring case", async () => {
    const ctx = await managerContext();
    const centro = await createUnitOrThrow(ctx);
    const norte = await createUnitOrThrow(ctx, { name: "Unidade Norte" });
    expect((await units.createRoom(ctx, { unitId: centro, name: "Sala 1" })).ok).toBe(true);
    const duplicate = await units.createRoom(ctx, { unitId: centro, name: "SALA 1" });
    expect(!duplicate.ok && duplicate.error.code).toBe("UNITS_ROOM_NAME_TAKEN");
    expect((await units.createRoom(ctx, { unitId: norte, name: "Sala 1" })).ok).toBe(true);
  });

  it("F02: the 31st active room in a unit is rejected", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    for (let index = 1; index <= 30; index++) {
      expect((await units.createRoom(ctx, { unitId, name: `Sala ${index}` })).ok).toBe(true);
    }
    const extra = await units.createRoom(ctx, { unitId, name: "Sala 31" });
    expect(!extra.ok && extra.error.code).toBe("UNITS_ROOM_LIMIT");
  });

  it("F02: a room with future appointments cannot be deactivated", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    const room = await units.createRoom(ctx, { unitId, name: "Sala 2" });
    if (!room.ok) throw new Error("room");
    units.registerScheduledAppointments(fakeAppointments({ countFutureInRoom: 12 }));
    const result = await units.setRoomActive(ctx, { roomId: room.value.roomId, active: false });
    expect(!result.ok && result.error).toMatchObject({
      code: "UNITS_ROOM_HAS_APPOINTMENTS",
      params: { count: 12 },
    });
    expect((await db().room.findUniqueOrThrow({ where: { id: room.value.roomId } })).active).toBe(true);
  });

  it("F02: deactivated rooms are hidden from booking lists but remain readable", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    const room = await units.createRoom(ctx, { unitId, name: "Sala 2" });
    await units.createRoom(ctx, { unitId, name: "Sala 3" });
    if (!room.ok) throw new Error("room");
    expect((await units.setRoomActive(ctx, { roomId: room.value.roomId, active: false })).ok).toBe(true);
    const active = await units.listRooms(ctx, unitId, { activeOnly: true });
    expect(active.ok && active.value.map((item) => item.name)).toEqual(["Sala 3"]);
    const all = await units.listRooms(ctx, unitId);
    expect(all.ok && all.value).toHaveLength(2);
    const events = await auditEvents({ action: "UPDATE", entityId: room.value.roomId });
    expect(events[0]?.changes).toEqual({ active: { before: true, after: false } });
  });
});

describe("closures", () => {
  it("F02: a closure over appointments warns with the count and saves after confirmation", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    units.registerScheduledAppointments(fakeAppointments({ countInDateRange: 8 }));
    const input = {
      unitId,
      startsOn: isoDaysFromToday(10),
      endsOn: isoDaysFromToday(10),
      reason: "Feriado municipal",
    };

    const first = await units.createClosure(ctx, input);
    expect(!first.ok && first.error).toMatchObject({
      code: "UNITS_CLOSURE_CONFIRMATION_REQUIRED",
      params: { count: 8 },
    });
    expect(await db().unitClosure.count()).toBe(0);

    const confirmed = await units.createClosure(ctx, { ...input, confirmOverlap: true });
    expect(confirmed.ok && confirmed.value.overlappingAppointments).toBe(8);
    const closures = await units.listClosures(ctx, unitId);
    expect(closures.ok && closures.value).toMatchObject([
      { startsOn: input.startsOn, reason: "Feriado municipal" },
    ]);
    expect(await auditEvents({ action: "CREATE" })).toEqual(
      expect.arrayContaining([expect.objectContaining({ entityType: "unit_closure" })]),
    );
  });

  it("F02: closures cannot start in the past or end before they start", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    const past = await units.createClosure(ctx, {
      unitId,
      startsOn: isoDaysFromToday(-1),
      endsOn: isoDaysFromToday(1),
      reason: "Reforma",
    });
    expect(!past.ok && past.error.fields?.startsOn).toBe("units.validation.closureStartInPast");
    const reversed = await units.createClosure(ctx, {
      unitId,
      startsOn: isoDaysFromToday(5),
      endsOn: isoDaysFromToday(4),
      reason: "Reforma",
    });
    expect(!reversed.ok && reversed.error.fields?.endsOn).toBe("units.validation.endBeforeStart");
  });

  it("F02: future closures can be deleted and past ones cannot", async () => {
    const ctx = await managerContext();
    const unitId = await createUnitOrThrow(ctx);
    const created = await units.createClosure(ctx, {
      unitId,
      startsOn: isoDaysFromToday(3),
      endsOn: isoDaysFromToday(4),
      reason: "Dedetização",
    });
    if (!created.ok) throw new Error("closure");
    expect((await units.deleteClosure(ctx, { closureId: created.value.closureId })).ok).toBe(true);
    expect(await auditEvents({ action: "DELETE", entityId: created.value.closureId })).toHaveLength(1);

    const pastId = "01927a12-0a1b-7c2d-9e3f-4a5b6c7d8e9f";
    await db().unitClosure.create({
      data: {
        id: pastId,
        organizationId: ctx.organizationId,
        unitId,
        startsOn: new Date(`${isoDaysFromToday(-10)}T00:00:00Z`),
        endsOn: new Date(`${isoDaysFromToday(-9)}T00:00:00Z`),
        reason: "Antigo",
      },
    });
    const past = await units.deleteClosure(ctx, { closureId: pastId });
    expect(!past.ok && past.error.code).toBe("UNITS_CLOSURE_IN_PAST");
  });
});
