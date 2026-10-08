import { describe, expect, it } from "vitest";
import {
  percentToBasisPoints,
  previewDiscount,
  remainingMinor,
  sameDiscount,
  type PaymentLine,
} from "./payment-lines";

const line = (amountMinor: number, key = "a"): PaymentLine => ({
  key,
  method: "PIX",
  amountMinor,
  installments: 1,
});

describe("receive modal helpers", () => {
  it("F09: the payment modal computes the remaining balance live", () => {
    expect(remainingMinor(20_000, 0, [line(10_000), line(5000, "b")])).toBe(5000);
    expect(remainingMinor(20_000, 0, [line(25_000)])).toBe(-5000);
    expect(remainingMinor(20_000, 6000, [line(14_000)])).toBe(0);
  });

  it("F09: typed percentages become basis points and invalid text is refused", () => {
    expect(percentToBasisPoints("15")).toBe(1500);
    expect(percentToBasisPoints("12,5")).toBe(1250);
    expect(percentToBasisPoints("100")).toBe(10_000);
    for (const text of ["", "0", "101", "abc", "1,234", "-5"]) expect(percentToBasisPoints(text)).toBeNull();
  });

  it("F09: the discount preview flags the reason and approval thresholds", () => {
    expect(previewDiscount(10_000, null)).toMatchObject({ valid: true, discountMinor: 0 });
    expect(previewDiscount(10_000, { kind: "PERCENT", value: 1000 })).toMatchObject({ needsReason: false });
    expect(previewDiscount(10_000, { kind: "PERCENT", value: 1500 })).toMatchObject({
      discountMinor: 1500,
      needsReason: true,
      needsApproval: false,
    });
    expect(previewDiscount(10_000, { kind: "AMOUNT", value: 2500 })).toMatchObject({ needsApproval: true });
    expect(previewDiscount(10_000, { kind: "AMOUNT", value: 20_000 }).valid).toBe(false);
    expect(sameDiscount({ kind: "PERCENT", value: 1 }, { kind: "PERCENT", value: 1 })).toBe(true);
    expect(sameDiscount(null, { kind: "PERCENT", value: 1 })).toBe(false);
  });
});
