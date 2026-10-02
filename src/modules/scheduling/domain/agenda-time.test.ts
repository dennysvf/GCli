import { describe, expect, it } from "vitest";
import {
  isAlignedStart,
  latenessMinutes,
  localSpan,
  localTime,
  rangeAt,
  withinUndoWindow,
} from "./agenda-time";

describe("agenda time", () => {
  it("F06: start times align to the organization granularity in the unit time zone", () => {
    expect(isAlignedStart(14 * 60 + 10, 15)).toBe(false);
    expect(isAlignedStart(14 * 60 + 10, 5)).toBe(true);
    expect(isAlignedStart(1440, 5)).toBe(false);
    const range = rangeAt("2026-10-06", 14 * 60 + 30, 50, "America/Manaus");
    expect(range.start.toISOString()).toBe("2026-10-06T18:30:00.000Z");
    expect(localTime(range.end, "America/Manaus")).toBe("15:20");
    expect(localSpan(range, "America/Manaus")).toEqual({
      date: "2026-10-06",
      weekday: 2,
      start: 870,
      end: 920,
    });
  });

  it("F06: lateness and undo windows", () => {
    const start = new Date("2026-10-06T17:00:00.000Z");
    expect(latenessMinutes("CONFIRMED", start, new Date("2026-10-06T17:10:00.000Z"))).toBeNull();
    expect(latenessMinutes("CONFIRMED", start, new Date("2026-10-06T17:12:00.000Z"))).toBe(12);
    expect(latenessMinutes("CHECKED_IN", start, new Date("2026-10-06T17:30:00.000Z"))).toBeNull();
    expect(withinUndoWindow(start, new Date("2026-10-06T17:30:00.000Z"))).toBe(true);
    expect(withinUndoWindow(start, new Date("2026-10-06T17:30:01.000Z"))).toBe(false);
  });
});
