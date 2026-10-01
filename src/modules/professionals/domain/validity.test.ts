import { describe, expect, it } from "vitest";
import { addDays, isoWeekday, nextMonday } from "./dates";
import {
  isScheduleDeletable,
  isScheduleEditable,
  planSchedule,
  scheduleOn,
  scheduleState,
  validateValidity,
} from "./validity";

const current = { id: "a", validFrom: "2026-09-01", validUntil: null };
const future = { id: "b", validFrom: "2026-11-02", validUntil: null };
const ended = { id: "c", validFrom: "2026-01-01", validUntil: "2026-08-31" };
const TODAY = "2026-10-01";

describe("schedule validity", () => {
  it("F04: the schedule in effect is chosen by date", () => {
    const schedules = [{ ...current, validUntil: "2026-11-01" }, future];
    expect(scheduleOn(schedules, "2026-11-01")?.id).toBe("a");
    expect(scheduleOn(schedules, "2026-11-02")?.id).toBe("b");
    expect(scheduleOn(schedules, "2026-08-31")).toBeUndefined();
  });

  it("F04: planning a future schedule closes the open schedule on the previous day", () => {
    expect(planSchedule([current], { validFrom: "2026-11-02", validUntil: null })).toEqual({
      ok: true,
      close: { id: "a", validUntil: "2026-11-01" },
    });
    expect(planSchedule([current, future], { validFrom: "2026-10-15", validUntil: null })).toEqual({
      ok: false,
      conflictFrom: "2026-11-02",
    });
    expect(planSchedule([ended], { validFrom: TODAY, validUntil: null })).toEqual({ ok: true, close: null });
  });

  it("F04: ended schedules are read-only and started schedules cannot be deleted", () => {
    expect(scheduleState(ended, TODAY)).toBe("ended");
    expect(scheduleState(current, TODAY)).toBe("current");
    expect(scheduleState(future, TODAY)).toBe("future");
    expect(isScheduleEditable(ended, TODAY)).toBe(false);
    expect(isScheduleEditable(current, TODAY)).toBe(true);
    expect(isScheduleDeletable(current, TODAY)).toBe(false);
    expect(isScheduleDeletable(future, TODAY)).toBe(true);
  });

  it("validates schedule dates", () => {
    expect(validateValidity({ validFrom: "2026-09-30", validUntil: null }, null, TODAY)).toHaveProperty(
      "validFrom",
    );
    expect(validateValidity({ validFrom: TODAY, validUntil: null }, null, TODAY)).toBeNull();
    expect(validateValidity({ validFrom: "2026-09-02", validUntil: null }, current, TODAY)).toHaveProperty(
      "validFrom",
    );
    expect(
      validateValidity({ validFrom: "2026-09-01", validUntil: "2026-12-31" }, current, TODAY),
    ).toBeNull();
    expect(validateValidity({ validFrom: TODAY, validUntil: "2026-09-30" }, null, TODAY)).toHaveProperty(
      "validUntil",
    );
  });

  it("does calendar arithmetic on date strings", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoWeekday("2026-10-04")).toBe(7);
    expect(isoWeekday("2026-10-05")).toBe(1);
    expect(nextMonday("2026-10-01")).toBe("2026-10-05");
    expect(nextMonday("2026-10-05")).toBe("2026-10-12");
  });
});
