import { describe, expect, it } from "vitest";
import { agingBucket, daysOpen } from "./aging";

describe("receivables aging", () => {
  it("F13: days open count calendar days from the issue date to today", () => {
    expect(daysOpen("2026-10-12", "2026-10-12")).toBe(0);
    expect(daysOpen("2026-09-12", "2026-10-12")).toBe(30);
    expect(daysOpen("2026-10-13", "2026-10-12")).toBe(0);
  });

  it("F13: aging buckets classify 0, 30, 31, 60, 61, 90 and 91 days at their boundaries", () => {
    expect([0, 30, 31, 60, 61, 90, 91, 400].map(agingBucket)).toEqual([
      "D0_30",
      "D0_30",
      "D31_60",
      "D31_60",
      "D61_90",
      "D61_90",
      "D90_PLUS",
      "D90_PLUS",
    ]);
  });
});
