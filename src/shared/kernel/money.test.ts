import { describe, expect, it } from "vitest";
import { Money, formatCents } from "./money";

describe("Money", () => {
  it("F03: Money formats cents as BRL", () => {
    expect(formatCents(0)).toBe("R$ 0,00");
    expect(formatCents(123456)).toBe("R$ 1.234,56");
    expect(formatCents(9999999)).toBe("R$ 99.999,99");
  });

  it("F03: Money parses masked BRL input", () => {
    const cents = (text: string) => {
      const parsed = Money.parseBRL(text);
      return parsed.ok ? parsed.value.cents : parsed.error.code;
    };
    expect(cents("1.234,56")).toBe(123456);
    expect(cents("R$ 0,00")).toBe(0);
    expect(cents("12,3")).toBe(1230);
    expect(cents("80")).toBe(8000);
    expect(cents("1234,5")).toBe(123450);
    expect(cents("abc")).toBe("MONEY_INVALID");
    expect(cents("1,234")).toBe("MONEY_INVALID");
    expect(cents("-5,00")).toBe("MONEY_INVALID");
  });

  it("rejects non-integer cents and adds amounts", () => {
    expect(() => Money.fromCents(1.5)).toThrow(RangeError);
    expect(Money.fromCents(150).add(Money.fromCents(50)).equals(Money.fromCents(200))).toBe(true);
  });
});
