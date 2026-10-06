import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { professionals } from "@/modules/professionals";
import { units } from "@/modules/units";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, errorText, resetDatabase } from "../helpers";
import {
  createProfessionalOrThrow,
  createUnitWithHours,
  h,
  orgDate,
  professionalsContext,
  type TestContext,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

async function setup() {
  const ctx = await professionalsContext();
  const centro = await createUnitWithHours(ctx, { name: "Unidade Centro" });
  const sul = await createUnitWithHours(ctx, { name: "Unidade Sul" });
  const professionalId = await createProfessionalOrThrow(ctx);
  return { ctx, centro, sul, professionalId };
}

function save(ctx: TestContext, input: Record<string, unknown>) {
  return professionals.saveSchedule(ctx, input);
}

function message(error: { code: string; params?: Record<string, string | number> | undefined }) {
  return errorText("professionals", error);
}

describe("working-hour schedules", () => {
  it("F04: working hours overlapping another unit on the same weekday are rejected", async () => {
    const { ctx, centro, sul, professionalId } = await setup();
    const result = await save(ctx, {
      professionalId,
      validFrom: orgDate(),
      intervals: [
        { unitId: centro, weekday: 2, start: h(8), end: h(12) },
        { unitId: sul, weekday: 2, start: h(10), end: h(14) },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PROFESSIONALS_CROSS_UNIT_CONFLICT");
    const expected =
      "Conflito de horário: este profissional já atende na unidade Centro às terças, 08:00–12:00.";
    expect(message(result.error)).toBe(expected);
    expect(result.error.fields?.["intervals.1"]).toBe(
      "professionals.errors.PROFESSIONALS_CROSS_UNIT_CONFLICT",
    );
    expect(await db().professionalSchedule.count()).toBe(0);

    // Different weekdays, or touching intervals, are fine.
    const ok = await save(ctx, {
      professionalId,
      validFrom: orgDate(),
      intervals: [
        { unitId: centro, weekday: 2, start: h(8), end: h(12) },
        { unitId: sul, weekday: 2, start: h(12), end: h(14) },
        { unitId: sul, weekday: 3, start: h(8), end: h(12) },
      ],
    });
    expect(ok.ok).toBe(true);
  });

  it("F04: working hours outside the unit's business hours are rejected with the unit's hours", async () => {
    const { ctx, centro, professionalId } = await setup();
    const result = await save(ctx, {
      professionalId,
      validFrom: orgDate(),
      intervals: [{ unitId: centro, weekday: 1, start: h(7), end: h(9) }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PROFESSIONALS_OUTSIDE_BUSINESS_HOURS");
    expect(message(result.error)).toBe(
      "O horário informado está fora do funcionamento da unidade (08:00–18:00).",
    );

    const sunday = await save(ctx, {
      professionalId,
      validFrom: orgDate(),
      intervals: [{ unitId: centro, weekday: 7, start: h(9), end: h(10) }],
    });
    expect(!sunday.ok && sunday.error.fields?.["intervals.0"]).toBe(
      "professionals.errors.PROFESSIONALS_OUTSIDE_BUSINESS_HOURS?hours=fechada+%C3%A0s+domingos",
    );
  });

  it("F04: a future-dated schedule does not change availability before its start date", async () => {
    const { ctx, centro, professionalId } = await setup();
    const first = await save(ctx, {
      professionalId,
      validFrom: orgDate(),
      intervals: [1, 2, 3, 4, 5, 6].map((weekday) => ({ unitId: centro, weekday, start: h(8), end: h(12) })),
    });
    expect(first.ok).toBe(true);
    const second = await save(ctx, {
      professionalId,
      validFrom: orgDate(14),
      intervals: [1, 2, 3, 4, 5, 6].map((weekday) => ({ unitId: centro, weekday, start: h(13), end: h(17) })),
    });
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.closedPrevious).toEqual({
      scheduleId: first.value.scheduleId,
      validUntil: orgDate(13),
    });

    const calendar = await professionals.getWorkingCalendar(ctx, professionalId, {
      from: orgDate(),
      to: orgDate(27),
    });
    expect(calendar.ok).toBe(true);
    if (!calendar.ok) return;
    for (const day of calendar.value.days) {
      const intervals = day.units.flatMap((unit) => unit.intervals);
      if (day.weekday === 7) {
        expect(intervals).toEqual([]);
      } else if (day.date < orgDate(14)) {
        expect(intervals).toEqual([{ start: h(8), end: h(12) }]);
      } else {
        expect(intervals).toEqual([{ start: h(13), end: h(17) }]);
      }
    }
  });

  it("F04: a schedule starting where a later one already starts is rejected", async () => {
    const { ctx, centro, professionalId } = await setup();
    const interval = [{ unitId: centro, weekday: 1, start: h(8), end: h(12) }];
    await save(ctx, { professionalId, validFrom: orgDate(), intervals: interval });
    await save(ctx, { professionalId, validFrom: orgDate(20), intervals: interval });
    const conflict = await save(ctx, { professionalId, validFrom: orgDate(10), intervals: interval });
    expect(!conflict.ok && conflict.error.code).toBe("PROFESSIONALS_SCHEDULE_OVERLAP");
    const past = await save(ctx, { professionalId, validFrom: orgDate(-1), intervals: interval });
    expect(!past.ok && past.error.fields?.validFrom).toBe("professionals.validation.startInPast");
  });

  it("F04: overlapping schedules are rejected even under concurrent saves", async () => {
    const { ctx, centro, professionalId } = await setup();
    const interval = [{ unitId: centro, weekday: 1, start: h(8), end: h(12) }];
    const results = await Promise.all(
      [0, 0, 0].map(() => save(ctx, { professionalId, validFrom: orgDate(3), intervals: interval })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    for (const result of results.filter((item) => !item.ok)) {
      expect(!result.ok && result.error.code).toBe("PROFESSIONALS_SCHEDULE_OVERLAP");
    }
    expect(await db().professionalSchedule.count()).toBe(1);
  });

  it("F04: deleting a future schedule restores the previous end date", async () => {
    const { ctx, centro, professionalId } = await setup();
    const interval = [{ unitId: centro, weekday: 1, start: h(8), end: h(12) }];
    const current = await save(ctx, { professionalId, validFrom: orgDate(), intervals: interval });
    const future = await save(ctx, { professionalId, validFrom: orgDate(7), intervals: interval });
    if (!current.ok || !future.ok) throw new Error("setup failed");

    const startedDelete = await professionals.deleteSchedule(ctx, { scheduleId: current.value.scheduleId });
    expect(!startedDelete.ok && startedDelete.error.code).toBe("PROFESSIONALS_SCHEDULE_STARTED");

    const deleted = await professionals.deleteSchedule(ctx, { scheduleId: future.value.scheduleId });
    expect(deleted.ok && deleted.value.restoredPrevious).toEqual({
      scheduleId: current.value.scheduleId,
      validUntil: null,
    });
    const row = await db().professionalSchedule.findUniqueOrThrow({
      where: { id: current.value.scheduleId },
    });
    expect(row.validUntil).toBeNull();
    expect(await auditEvents({ action: "DELETE", entityId: future.value.scheduleId })).toHaveLength(1);
  });

  it("F04: editing the current schedule keeps its start and checks the version", async () => {
    const { ctx, centro, professionalId } = await setup();
    const created = await save(ctx, {
      professionalId,
      validFrom: orgDate(),
      intervals: [{ unitId: centro, weekday: 1, start: h(8), end: h(12) }],
    });
    if (!created.ok) throw new Error("setup failed");
    const edit = (version: number, start: number) =>
      save(ctx, {
        professionalId,
        scheduleId: created.value.scheduleId,
        version,
        validFrom: orgDate(),
        intervals: [{ unitId: centro, weekday: 1, start, end: h(12) }],
      });
    expect((await edit(1, h(9))).ok).toBe(true);
    const stale = await edit(1, h(10));
    expect(!stale.ok && stale.error.code).toBe("CONFLICT_STALE_VERSION");
    const intervals = await db().professionalWorkingInterval.findMany({
      where: { scheduleId: created.value.scheduleId },
    });
    expect(intervals.map((row) => row.startMinute)).toEqual([h(9)]);
  });

  it("F02→F04: active units appear in the working-hours grid with their business hours", async () => {
    const { ctx, centro, sul, professionalId } = await setup();
    await units.setUnitActive(ctx, { unitId: sul, active: false });
    const list = await professionals.listSchedules(ctx, professionalId);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const active = list.value.units.filter((unit) => unit.active);
    expect(active.map((unit) => unit.id)).toEqual([centro]);
    expect(active[0]?.timeZone).toBe("America/Sao_Paulo");
    expect(active[0]?.businessHours.find((day) => day.weekday === 1)?.intervals).toEqual([
      { start: h(8), end: h(18) },
    ]);

    const inactive = await save(ctx, {
      professionalId,
      validFrom: orgDate(),
      intervals: [{ unitId: sul, weekday: 1, start: h(8), end: h(12) }],
    });
    expect(!inactive.ok && inactive.error.code).toBe("PROFESSIONALS_INVALID_UNITS");
  });
});
