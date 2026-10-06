import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  localMinuteToUtc,
  utcOffsetMinutes,
  utcToZonedParts,
  zonedTimeToUtc,
} from "./zoned-time";

const iso = (local: string, zone: string) => zonedTimeToUtc(local, zone).toISOString();

describe("zoned time", () => {
  it("converts local wall-clock times to instants and back", () => {
    const instant = zonedTimeToUtc("2026-10-06T14:30", "America/Sao_Paulo");
    expect(instant.toISOString()).toBe("2026-10-06T17:30:00.000Z");
    expect(utcToZonedParts(instant, "America/Manaus")).toEqual({ date: "2026-10-06", minute: 13 * 60 + 30 });
    expect(utcOffsetMinutes("America/Manaus", instant)).toBe(-240);
  });

  it("adds minutes from local midnight, including the end of the day", () => {
    expect(localMinuteToUtc("2026-10-06", 600, "America/Sao_Paulo").toISOString()).toBe(
      "2026-10-06T13:00:00.000Z",
    );
    expect(localMinuteToUtc("2026-10-06", 1440, "America/Sao_Paulo").toISOString()).toBe(
      "2026-10-07T03:00:00.000Z",
    );
  });

  it("F16: wall-clock times are converted correctly across daylight saving changes", () => {
    // Madrid: 2026-03-29 02:00 -> 03:00 (gap) and 2026-10-25 03:00 -> 02:00 (overlap).
    expect(iso("2026-03-29T01:30", "Europe/Madrid")).toBe("2026-03-29T00:30:00.000Z");
    expect(iso("2026-03-29T02:30", "Europe/Madrid")).toBe("2026-03-29T01:30:00.000Z"); // 03:30 local
    expect(iso("2026-03-29T03:30", "Europe/Madrid")).toBe("2026-03-29T01:30:00.000Z");
    expect(iso("2026-10-25T01:30", "Europe/Madrid")).toBe("2026-10-24T23:30:00.000Z");
    expect(iso("2026-10-25T02:30", "Europe/Madrid")).toBe("2026-10-25T00:30:00.000Z"); // earlier instant
    expect(iso("2026-10-25T03:30", "Europe/Madrid")).toBe("2026-10-25T02:30:00.000Z");
    // New York: 2026-03-08 02:00 -> 03:00 and 2026-11-01 02:00 -> 01:00.
    expect(iso("2026-03-08T02:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
    expect(iso("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
    // Lisbon: 2026-03-29 01:00 -> 02:00 and 2026-10-25 02:00 -> 01:00.
    expect(iso("2026-03-29T01:30", "Europe/Lisbon")).toBe("2026-03-29T01:30:00.000Z");
    expect(iso("2026-10-25T01:30", "Europe/Lisbon")).toBe("2026-10-25T00:30:00.000Z");
    // Santiago: 2026-09-06 00:00 -> 01:00 (gap) and 2026-04-04 24:00 -> 23:00 (overlap).
    expect(iso("2026-09-06T00:30", "America/Santiago")).toBe("2026-09-06T04:30:00.000Z"); // 01:30 local
    expect(iso("2026-04-04T23:30", "America/Santiago")).toBe("2026-04-05T02:30:00.000Z"); // earlier instant
    // Brazil has no daylight saving time: nothing moves.
    expect(iso("2026-03-29T02:30", "America/Sao_Paulo")).toBe("2026-03-29T05:30:00.000Z");
    expect(iso("2026-10-25T02:30", "America/Sao_Paulo")).toBe("2026-10-25T05:30:00.000Z");
  });

  it("F16: a 09:00 slot stays at 09:00 local time on both sides of a change", () => {
    const friday = localMinuteToUtc("2026-03-27", 9 * 60, "Europe/Madrid");
    const monday = localMinuteToUtc("2026-03-30", 9 * 60, "Europe/Madrid");
    expect(friday.toISOString()).toBe("2026-03-27T08:00:00.000Z");
    expect(monday.toISOString()).toBe("2026-03-30T07:00:00.000Z");
    expect(utcToZonedParts(friday, "Europe/Madrid")).toEqual({ date: "2026-03-27", minute: 540 });
    expect(utcToZonedParts(monday, "Europe/Madrid")).toEqual({ date: "2026-03-30", minute: 540 });
  });

  it("F16: the day of a change is 23 or 25 hours long", () => {
    const hours = (date: string, zone: string) =>
      (localMinuteToUtc(date, 1440, zone).getTime() - localMinuteToUtc(date, 0, zone).getTime()) / 3_600_000;
    expect(hours("2026-03-29", "Europe/Madrid")).toBe(23);
    expect(hours("2026-10-25", "Europe/Madrid")).toBe(25);
    expect(hours("2026-03-28", "Europe/Madrid")).toBe(24);
    expect(hours("2026-10-25", "America/Sao_Paulo")).toBe(24);
  });

  it("does the calendar arithmetic of dates without a time zone", () => {
    expect(addCalendarDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
