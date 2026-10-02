import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { professionals } from "@/modules/professionals";
import { scheduling } from "@/modules/scheduling";
import { closeHelpers, auditEvents, resetDatabase } from "../helpers";
import { createUnitWithHours, h } from "../professionals/support";
import { booking, bookOrThrow, day, firstReasonId, schedulingWorld, type World } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: World;
beforeEach(async () => {
  world = await schedulingWorld();
});

describe("agenda reads", () => {
  it("F06: the day agenda lists appointments with names, columns and unit hours", async () => {
    await bookOrThrow(world.desk, booking(world));
    const agenda = await scheduling.getAgenda(world.desk, { unitId: world.unitId, from: day(7), to: day(7) });
    if (!agenda.ok) throw new Error(agenda.error.code);
    expect(agenda.value.items).toEqual([
      expect.objectContaining({
        patient: expect.objectContaining({ displayName: "Mari Oliveira" }),
        service: expect.objectContaining({ name: "Consulta", color: "blue" }),
        professional: expect.objectContaining({ displayName: "Dra. Ana" }),
        room: expect.objectContaining({ name: "Sala 1" }),
        status: "SCHEDULED",
      }),
    ]);
    expect(agenda.value.professionals?.map((column) => column.label)).toEqual(["Dr. Bruno", "Dra. Ana"]);
    expect(agenda.value.professionals?.[0]?.workingIntervals).toEqual([
      { date: day(7), start: h(8), end: h(18) },
    ]);
    expect(agenda.value.rooms?.map((column) => column.label)).toEqual(["Sala 1", "Sala 2"]);
    expect(agenda.value.unitHours).toEqual([
      { date: day(7), intervals: [{ start: h(7), end: h(21) }], closure: null },
    ]);
  });

  it("F06: a change made by one user appears in another user's agenda within 30 seconds", async () => {
    const first = await scheduling.getAgenda(world.manager, {
      unitId: world.unitId,
      from: day(7),
      to: day(7),
    });
    if (!first.ok) throw new Error("agenda");
    expect(first.value.items).toEqual([]);
    const booked = await bookOrThrow(world.desk, booking(world));
    const poll = await scheduling.getAgenda(world.manager, {
      unitId: world.unitId,
      from: day(7),
      to: day(7),
      since: first.value.serverTime,
    });
    expect(poll.ok && poll.value.items.map((item) => item.id)).toEqual([booked.appointmentId]);
    expect(poll.ok && poll.value.professionals).toBeUndefined();
    // Cancelled rows are returned too, so open agendas remove them.
    const after = poll.ok ? poll.value.serverTime : "";
    await scheduling.cancelAppointment(world.desk, {
      appointmentId: booked.appointmentId,
      version: 1,
      origin: "CLINIC",
      reasonId: await firstReasonId(world.desk),
    });
    const second = await scheduling.getAgenda(world.manager, {
      unitId: world.unitId,
      from: day(7),
      to: day(7),
      since: after,
    });
    expect(second.ok && second.value.items.map((item) => item.status)).toEqual(["CANCELLED"]);
  });

  it("F06: a professional user sees only their own appointments", async () => {
    const own = await bookOrThrow(world.desk, booking(world));
    const other = await bookOrThrow(
      world.desk,
      booking(world, { professionalId: world.professionals.bruno, roomId: world.rooms.sala2 }),
    );
    // Another unit where Ana also works.
    const sul = await createUnitWithHours(world.admin, {
      name: "Unidade Sul",
      hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, intervals: [{ start: h(7), end: h(21) }] })),
    });
    const schedules = await professionals.listSchedules(world.admin, world.professionals.ana);
    if (!schedules.ok) throw new Error("schedules");
    const current = schedules.value.schedules[0];
    if (!current) throw new Error("schedule");
    const saved = await professionals.saveSchedule(world.admin, {
      professionalId: world.professionals.ana,
      scheduleId: current.id,
      version: current.version,
      validFrom: current.validFrom,
      intervals: [1, 2, 3, 4, 5, 6, 7].flatMap((weekday) => [
        { unitId: world.unitId, weekday, start: h(8), end: h(12) },
        { unitId: sul, weekday, start: h(14), end: h(18) },
      ]),
    });
    if (!saved.ok) throw new Error(saved.error.code);
    const inSul = await bookOrThrow(
      world.desk,
      booking(world, { unitId: sul, roomId: null, serviceId: world.services.retorno, startTime: "15:00" }),
    );

    const agenda = await scheduling.getAgenda(world.pro, {
      unitId: "all",
      from: day(7),
      to: day(7),
      professionalIds: [world.professionals.bruno],
    });
    expect(agenda.ok && agenda.value.items.map((item) => item.id).sort()).toEqual(
      [own.appointmentId, inSul.appointmentId].sort(),
    );
    const list = await scheduling.listAppointments(world.pro, {
      unitId: world.unitId,
      from: day(0),
      to: day(30),
    });
    expect(list.ok && list.value.items.map((item) => item.id)).toEqual([own.appointmentId]);
    const hidden = await scheduling.getAppointment(world.pro, other.appointmentId);
    expect(!hidden.ok && hidden.error.code).toBe("SCHEDULING_NOT_FOUND");
    const desk = await scheduling.getAgenda(world.desk, { unitId: "all", from: day(7), to: day(7) });
    expect(!desk.ok && desk.error.code).toBe("VALIDATION_FAILED");
  });

  it("F06: the list view pages by 50 and filters by status", async () => {
    await bookOrThrow(world.desk, booking(world));
    await bookOrThrow(world.desk, booking(world, { patientId: world.patients.joao, startTime: "11:00" }));
    const list = await scheduling.listAppointments(world.desk, {
      unitId: world.unitId,
      from: day(0),
      to: day(30),
      statuses: "SCHEDULED",
    });
    expect(list.ok && list.value).toMatchObject({ page: 1, pageSize: 50, total: 2 });
    const none = await scheduling.listAppointments(world.desk, {
      unitId: world.unitId,
      from: day(0),
      to: day(30),
      statuses: ["CANCELLED"],
    });
    expect(none.ok && none.value.total).toBe(0);
  });

  it("F06: next free slot returns up to 10 slots respecting all conflict rules within 60 days", async () => {
    const result = await scheduling.findNextAvailableSlots(world.desk, {
      unitId: world.unitId,
      serviceId: world.services.consulta,
      professionalId: world.professionals.ana,
    });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.slots).toHaveLength(10);
    const now = Date.now();
    for (const slot of result.value.slots) {
      expect(new Date(slot.startsAt).getTime()).toBeGreaterThan(now);
      expect(new Date(slot.startsAt).getTime()).toBeLessThan(now + 61 * 86_400_000);
      expect(slot.roomId).not.toBeNull();
    }
    // Booking the first proposed slot removes it from the next search.
    const first = result.value.slots[0];
    if (!first) throw new Error("slot");
    await bookOrThrow(
      world.desk,
      booking(world, { date: first.date, startTime: first.startTime, roomId: first.roomId }),
    );
    const again = await scheduling.findNextAvailableSlots(world.desk, {
      unitId: world.unitId,
      serviceId: world.services.consulta,
      professionalId: world.professionals.ana,
    });
    expect(again.ok && again.value.slots.some((slot) => slot.startsAt === first.startsAt)).toBe(false);
  });

  it("F06: the daily agenda PDF lists the professional's appointments and is audited", async () => {
    await bookOrThrow(world.desk, booking(world));
    const pdf = await scheduling.exportDailyAgenda(world.desk, {
      unitId: world.unitId,
      date: day(7),
      professionalId: world.professionals.ana,
    });
    if (!pdf.ok) throw new Error(pdf.error.code);
    expect(pdf.value.bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.value.fileName).toBe(`agenda-${day(7)}-dra-ana.pdf`);
    const audit = await auditEvents({ action: "EXPORT" });
    expect(audit[0]?.metadata).toMatchObject({ unitId: world.unitId, date: day(7), count: 1 });
    const foreign = await scheduling.exportDailyAgenda(world.pro, {
      unitId: world.unitId,
      date: day(7),
      professionalId: world.professionals.bruno,
    });
    expect(!foreign.ok && foreign.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F06: agenda queries ignore other organizations", async () => {
    await bookOrThrow(world.desk, booking(world));
    const other = await schedulingWorld();
    await bookOrThrow(other.desk, booking(other));
    const mine = await scheduling.listAppointments(world.desk, {
      unitId: world.unitId,
      from: day(0),
      to: day(30),
    });
    expect(mine.ok && mine.value.total).toBe(1);
    const theirs = await scheduling.getAgenda(world.desk, { unitId: other.unitId, from: day(7), to: day(7) });
    expect(theirs.ok).toBe(false);
  });
});
