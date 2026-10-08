import { describe, expect, it } from "vitest";
import { afterPinFailure, isPinFormat, isPinLocked, isWeakPin } from "./approval-pin";

describe("approval PIN rules", () => {
  it("F09: weak approval PINs are refused", () => {
    for (const pin of ["111111", "000000", "123456", "654321", "234567"]) expect(isWeakPin(pin)).toBe(true);
    expect(isWeakPin("402719")).toBe(false);
    expect(isWeakPin("123450")).toBe(false);
    expect(isPinFormat("12345a")).toBe(false);
    expect(isPinFormat("12345")).toBe(false);
    expect(isPinFormat("402719")).toBe(true);
  });

  it("F09: the PIN locks after 5 failures for 15 minutes", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    let count = 0;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const state = afterPinFailure(count, now);
      expect(state.lockedUntil).toBeNull();
      count = state.failedCount;
    }
    const locked = afterPinFailure(count, now);
    expect(locked.lockedUntil).toEqual(new Date("2026-10-08T12:15:00Z"));
    expect(locked.failedCount).toBe(0);
    expect(isPinLocked(locked.lockedUntil, new Date("2026-10-08T12:14:00Z"))).toBe(true);
    expect(isPinLocked(locked.lockedUntil, new Date("2026-10-08T12:15:00Z"))).toBe(false);
  });
});
