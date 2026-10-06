import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, negotiateLocale } from "./locales";

describe("locale negotiation", () => {
  it("F16: the browser language picks one of the three languages, else pt-BR", () => {
    expect(negotiateLocale("en-US,en;q=0.9")).toBe("en");
    expect(negotiateLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(negotiateLocale("pt-PT")).toBe("pt-BR");
    expect(negotiateLocale("fr-FR,fr;q=0.9")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("*")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("")).toBe(DEFAULT_LOCALE);
  });

  it("F16: quality values decide the order, ignoring languages with q=0", () => {
    expect(negotiateLocale("fr;q=0.9,en;q=0.5,es;q=0.8")).toBe("es");
    expect(negotiateLocale("en;q=0,es;q=0.1")).toBe("es");
  });

  it("recognizes only supported locales", () => {
    expect(isLocale("pt-BR")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("en-US")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
