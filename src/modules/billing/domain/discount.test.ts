import { describe, expect, it } from "vitest";
import { discountMinor, isValidDiscount, needsApproval, needsReason } from "./discount";

describe("discount math", () => {
  it("F09: a percentage discount rounds down to the cent", () => {
    // 15% of R$ 333,33: 33333 x 1500 / 10000 = 4999.95
    expect(discountMinor(33_333, { kind: "PERCENT", value: 1500 })).toBe(4999);
    expect(discountMinor(30_000, { kind: "AMOUNT", value: 4500 })).toBe(4500);
  });

  it("F09: the reason is required only above 10% and approval only above 20%", () => {
    const gross = 10_000;
    for (const [kind, value] of [
      ["PERCENT", 1000],
      ["AMOUNT", 1000],
    ] as const) {
      const amount = discountMinor(gross, { kind, value });
      expect(needsReason(gross, amount)).toBe(false);
    }
    expect(needsReason(gross, discountMinor(gross, { kind: "PERCENT", value: 1001 }))).toBe(true);
    expect(needsReason(gross, 1001)).toBe(true);
    expect(needsApproval(gross, discountMinor(gross, { kind: "PERCENT", value: 2000 }))).toBe(false);
    expect(needsApproval(gross, 2000)).toBe(false);
    expect(needsApproval(gross, discountMinor(gross, { kind: "PERCENT", value: 2001 }))).toBe(true);
    expect(needsApproval(gross, 2001)).toBe(true);
  });

  it("F09: a discount cannot exceed the gross amount or be zero", () => {
    expect(isValidDiscount(10_000, { kind: "AMOUNT", value: 0 })).toBe(false);
    expect(isValidDiscount(10_000, { kind: "AMOUNT", value: 10_001 })).toBe(false);
    expect(isValidDiscount(10_000, { kind: "AMOUNT", value: 10_000 })).toBe(true);
    expect(isValidDiscount(10_000, { kind: "PERCENT", value: 10_001 })).toBe(false);
    expect(isValidDiscount(10_000, { kind: "PERCENT", value: 10_000 })).toBe(true);
    // A tiny percentage of a tiny amount rounds to nothing.
    expect(isValidDiscount(50, { kind: "PERCENT", value: 10 })).toBe(false);
    expect(isValidDiscount(10_000, { kind: "AMOUNT", value: 1.5 })).toBe(false);
  });
});
