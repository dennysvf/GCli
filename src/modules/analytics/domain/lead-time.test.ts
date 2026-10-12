import { describe, expect, it } from "vitest";
import { leadTimeHours } from "./lead-time";

describe("cancellation lead time", () => {
  const starts = new Date("2026-09-04T13:00:00Z");

  it("F13: cancellation lead time is whole hours before the appointment, rounded down", () => {
    expect(leadTimeHours(new Date("2026-09-03T10:30:00Z"), starts)).toBe(26);
    expect(leadTimeHours(new Date("2026-09-04T12:30:00Z"), starts)).toBe(0);
  });

  it("F13: a cancellation after the start has a negative lead time", () => {
    expect(leadTimeHours(new Date("2026-09-04T14:10:00Z"), starts)).toBe(-2);
  });
});
