import { describe, expect, it } from "vitest";
import { expiryDate, remainingExtension } from "./validity";

describe("package validity", () => {
  it("F10: expiry date counts calendar days and extensions", () => {
    // The sale day is day 1: 180 days from 2026-10-09 end on 2027-04-06.
    expect(expiryDate("2026-10-09", 180, 0)).toBe("2027-04-06");
    expect(expiryDate("2026-10-09", 180, 60)).toBe("2027-06-05");
    expect(expiryDate("2026-01-01", 30, 0)).toBe("2026-01-30");
  });

  it("F10: extensions add up to 365 days at most", () => {
    expect(remainingExtension(0)).toBe(365);
    expect(remainingExtension(300)).toBe(65);
    expect(remainingExtension(365)).toBe(0);
  });
});
