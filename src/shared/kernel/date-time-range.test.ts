import { describe, expect, it } from "vitest";
import { DateTimeRange } from "./date-time-range";

const at = (time: string) => new Date(`2026-10-06T${time}:00.000Z`);
const range = (start: string, end: string) => {
  const result = DateTimeRange.of(at(start), at(end));
  if (!result.ok) throw new Error("empty");
  return result.value;
};

describe("DateTimeRange", () => {
  it("F06: date-time ranges overlap only when they share time", () => {
    expect(range("14:00", "14:50").overlaps(range("14:50", "15:00"))).toBe(false);
    expect(range("14:00", "15:00").overlaps(range("14:30", "14:40"))).toBe(true);
    expect(range("14:30", "14:40").overlaps(range("14:00", "15:00"))).toBe(true);
    expect(range("13:00", "14:00").overlaps(range("14:00", "15:00"))).toBe(false);
  });

  it("rejects empty ranges and reports minutes, containment and shifts", () => {
    expect(DateTimeRange.of(at("14:00"), at("14:00")).ok).toBe(false);
    const morning = range("08:00", "12:00");
    expect(morning.minutes).toBe(240);
    expect(morning.contains(range("09:00", "10:00"))).toBe(true);
    expect(morning.contains(range("11:30", "12:30"))).toBe(false);
    expect(morning.shift(30).start).toEqual(at("08:30"));
    expect(DateTimeRange.ofMinutes(at("10:00"), 50).end).toEqual(at("10:50"));
  });
});
