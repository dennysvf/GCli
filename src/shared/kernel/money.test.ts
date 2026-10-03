import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, Money, MoneyTotals, formatCents } from "./money";

describe("Money", () => {
  it("F03: Money formats minor units as BRL", () => {
    expect(formatCents(0)).toBe("R$ 0,00");
    expect(formatCents(123456)).toBe("R$ 1.234,56");
    expect(formatCents(9999999)).toBe("R$ 99.999,99");
  });

  it("F16: money is formatted per locale and currency minor units", () => {
    expect(Money.of(123456, "BRL").format("pt-BR")).toBe("R$ 1.234,56");
    expect(Money.of(123456, "USD").format("en-US")).toBe("$1,234.56");
    expect(Money.of(123456, "MXN").format("es-MX")).toBe("$1,234.56");
    expect(Money.of(1235, "CLP").format("es-CL")).toBe("$1.235");
    expect(Money.of(6000, "EUR").format("pt-PT")).toBe("60,00 €");
  });

  it("F16: money input accepts the separators of the locale", () => {
    const minor = (text: string, currency: Parameters<typeof Money.parse>[1], locale: string) => {
      const parsed = Money.parse(text, currency, locale);
      return parsed.ok ? parsed.value.amountMinor : parsed.error.code;
    };
    expect(minor("1.234,56", "BRL", "pt-BR")).toBe(123456);
    expect(minor("R$ 0,00", "BRL", "pt-BR")).toBe(0);
    expect(minor("12,3", "BRL", "pt-BR")).toBe(1230);
    expect(minor("80", "BRL", "pt-BR")).toBe(8000);
    expect(minor("1234,5", "EUR", "es-ES")).toBe(123450);
    expect(minor("1,234.56", "USD", "en-US")).toBe(123456);
    expect(minor("$1,234.5", "MXN", "es-MX")).toBe(123450);
    expect(minor("1.235", "CLP", "es-CL")).toBe(1235);
    expect(minor("abc", "BRL", "pt-BR")).toBe("MONEY_INVALID");
    expect(minor("1,234", "BRL", "pt-BR")).toBe("MONEY_INVALID");
    expect(minor("1.234", "USD", "en-US")).toBe("MONEY_INVALID");
    expect(minor("-5,00", "BRL", "pt-BR")).toBe("MONEY_INVALID");
    expect(minor("10,5", "CLP", "es-CL")).toBe("MONEY_INVALID");
  });

  it("rejects non-integer amounts and adds amounts of one currency", () => {
    expect(() => Money.of(1.5, "BRL")).toThrow(RangeError);
    expect(Money.of(150, "BRL").add(Money.of(50, "BRL")).equals(Money.of(200, "BRL"))).toBe(true);
    expect(Money.of(150, "BRL").equals(Money.of(150, "EUR"))).toBe(false);
  });

  it("F16: money refuses to add different currencies and totals group by currency", () => {
    expect(() => Money.of(100, "BRL").add(Money.of(100, "EUR"))).toThrow(CurrencyMismatchError);
    const totals = MoneyTotals.of([Money.of(1000, "BRL"), Money.of(600, "EUR"), Money.of(250, "BRL")]);
    expect(totals.get("BRL").amountMinor).toBe(1250);
    expect(totals.get("EUR").amountMinor).toBe(600);
    expect(totals.get("USD").amountMinor).toBe(0);
    expect(totals.toList().map((money) => `${money.currency}:${money.amountMinor}`)).toEqual([
      "BRL:1250",
      "EUR:600",
    ]);
    expect(new MoneyTotals().isEmpty()).toBe(true);
  });
});
