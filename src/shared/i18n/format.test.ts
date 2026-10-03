import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatLocale,
  formatMoney,
  formatNumber,
  formatTime,
  numberSeparators,
} from "./format";

describe("formatting locales", () => {
  it("F16: the formatting locale combines language and unit country", () => {
    expect(formatLocale("es", "MX")).toBe("es-MX");
    expect(formatLocale("en", "BR")).toBe("en-US");
    expect(formatLocale("pt-BR", "PT")).toBe("pt-PT");
    expect(formatLocale("pt-BR", "BR")).toBe("pt-BR");
    expect(formatLocale("pt-BR", "US")).toBe("pt-BR");
    expect(formatLocale("es", "US")).toBe("es-ES");
    expect(formatLocale("es")).toBe("es-ES");
  });

  it("F16: money is formatted per locale and currency minor units", () => {
    expect(formatMoney({ amountMinor: 123456, currency: "BRL" }, "pt-BR")).toBe("R$ 1.234,56");
    expect(formatMoney({ amountMinor: 123456, currency: "USD" }, "en-US")).toBe("$1,234.56");
    expect(formatMoney({ amountMinor: 123456, currency: "MXN" }, "es-MX")).toBe("$1,234.56");
    expect(formatMoney({ amountMinor: 1235, currency: "CLP" }, "es-CL")).toBe("$1.235");
    expect(formatMoney({ amountMinor: 6000, currency: "EUR" }, "pt-PT")).toBe("60,00 €");
    expect(formatMoney({ amountMinor: 6000n, currency: "EUR" }, "es-ES")).toBe("60,00 €");
  });

  it("F16: dates and times follow the locale and the time zone", () => {
    const instant = new Date("2026-10-05T17:30:00Z");
    expect(formatDate(instant, "pt-BR", "America/Sao_Paulo")).toBe("05/10/2026");
    expect(formatTime(instant, "pt-BR", "America/Sao_Paulo")).toBe("14:30");
    expect(formatDate(instant, "en-US", "America/New_York")).toBe("10/05/2026");
    expect(formatTime(instant, "en-US", "America/New_York")).toBe("01:30 PM");
    expect(formatDateTime(instant, "pt-PT", "Europe/Lisbon")).toBe("05/10/2026 18:30");
  });

  it("formats a calendar date without shifting it across time zones", () => {
    expect(formatDate("2026-10-05", "pt-BR", "Pacific/Kiritimati")).toBe("05/10/2026");
    expect(formatDate("2026-10-05", "en-US")).toBe("10/05/2026");
  });

  it("formats numbers and reports separators", () => {
    expect(formatNumber(1234.5, "pt-BR", { minimumFractionDigits: 2 })).toBe("1.234,50");
    expect(formatNumber(1234.5, "en-US", { minimumFractionDigits: 2 })).toBe("1,234.50");
    expect(numberSeparators("pt-BR")).toEqual({ decimal: ",", group: "." });
    expect(numberSeparators("es-MX")).toEqual({ decimal: ".", group: "," });
  });
});
