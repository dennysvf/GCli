import { describe, expect, it } from "vitest";
import en from "@/shared/i18n/messages/en.json";
import es from "@/shared/i18n/messages/es.json";
import ptBR from "@/shared/i18n/messages/pt-BR.json";
import { DOCUMENT_TYPES } from "../documents";
import {
  COUNTRY_CODES,
  COUNTRY_PROFILES,
  CURRENCIES,
  councilSpec,
  countryProfile,
  currencyOf,
  isTimeZoneOf,
  minorUnits,
} from "./index";

function hasKey(tree: unknown, key: string): boolean {
  let node = tree;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string";
}

describe("country profiles", () => {
  it("F16: the eight countries of the PRD have a profile", () => {
    expect([...COUNTRY_CODES]).toEqual(["BR", "PT", "ES", "MX", "AR", "CL", "CO", "US"]);
    for (const code of COUNTRY_CODES) expect(countryProfile(code).code).toBe(code);
  });

  it("F16: each profile defines currency, formatting region, phone code and zones", () => {
    const currencies = {
      BR: "BRL",
      PT: "EUR",
      ES: "EUR",
      MX: "MXN",
      AR: "ARS",
      CL: "CLP",
      CO: "COP",
      US: "USD",
    };
    const regions = {
      BR: "pt-BR",
      PT: "pt-PT",
      ES: "es-ES",
      MX: "es-MX",
      AR: "es-AR",
      CL: "es-CL",
      CO: "es-CO",
      US: "en-US",
    };
    const phoneCodes = { BR: "55", PT: "351", ES: "34", MX: "52", AR: "54", CL: "56", CO: "57", US: "1" };
    for (const code of COUNTRY_CODES) {
      const profile = countryProfile(code);
      expect(profile.currency).toBe(currencies[code]);
      expect(currencyOf(code)).toBe(currencies[code]);
      expect(profile.formattingRegion).toBe(regions[code]);
      expect(profile.phoneCode).toBe(phoneCodes[code]);
      expect(profile.timeZones).toContain(profile.defaultTimeZone);
      expect(isTimeZoneOf(code, profile.defaultTimeZone)).toBe(true);
      expect(isTimeZoneOf(code, "Asia/Tokyo")).toBe(false);
      // Every listed zone must exist in the runtime's time zone database.
      for (const zone of profile.timeZones)
        expect(() => new Intl.DateTimeFormat("en", { timeZone: zone })).not.toThrow();
    }
  });

  it("F16: only Brazil has validated legal rules", () => {
    for (const code of COUNTRY_CODES) {
      expect(countryProfile(code).legalRulesValidated).toBe(code === "BR");
    }
  });

  it("F16: every currency has minor units and the Chilean peso has none", () => {
    expect([...CURRENCIES].sort()).toEqual(["ARS", "BRL", "CLP", "COP", "EUR", "MXN", "USD"]);
    expect(minorUnits("CLP")).toBe(0);
    for (const currency of CURRENCIES.filter((value) => value !== "CLP"))
      expect(minorUnits(currency)).toBe(2);
  });

  it("F16: identity documents of a profile belong to its country and cover every type", () => {
    const offered = new Set<string>();
    for (const code of COUNTRY_CODES) {
      const profile = countryProfile(code);
      expect(profile.identityDocuments.length).toBeGreaterThan(0);
      for (const spec of profile.identityDocuments) {
        expect(spec.country).toBe(code);
        offered.add(spec.type);
      }
      expect(profile.taxId.country).toBe(code);
    }
    expect([...offered].sort()).toEqual([...DOCUMENT_TYPES].sort());
  });

  it("F16: postal code patterns accept their own examples and reject others", () => {
    const valid = {
      BR: ["01310-100", "01310100"],
      PT: ["1000-001", "1000001"],
      ES: ["28013"],
      MX: ["06600"],
      AR: ["C1425BQQ", "1425"],
      CL: ["8320000"],
      CO: ["110111"],
      US: ["10001", "10001-1234", "100011234"],
    };
    for (const code of COUNTRY_CODES) {
      const { postalCode } = countryProfile(code).address;
      for (const value of valid[code])
        expect(postalCode.pattern.test(postalCode.normalize(value))).toBe(true);
      expect(postalCode.pattern.test(postalCode.normalize("abc"))).toBe(false);
    }
    expect(countryProfile("BR").address.postalCode.lookup).toBe("viacep");
    expect(countryProfile("PT").address.postalCode.lookup).toBeUndefined();
  });

  it("F16: closed region lists have unique codes", () => {
    for (const code of COUNTRY_CODES) {
      const regions = countryProfile(code).address.region.regions;
      if (!regions) continue;
      expect(new Set(regions.map((region) => region.code)).size).toBe(regions.length);
    }
    expect(countryProfile("BR").address.region.regions).toHaveLength(27);
    expect(countryProfile("ES").address.region.regions).toHaveLength(52);
    expect(countryProfile("MX").address.region.regions).toHaveLength(32);
    expect(countryProfile("US").address.region.regions).toHaveLength(51);
    expect(countryProfile("PT").address.region.regions).toBeUndefined();
  });

  it("F16: each country lists councils and a default payment method list", () => {
    expect(councilSpec("BR", "CRM")?.regionRequired).toBe(true);
    expect(councilSpec("MX", "CEDULA")?.numberPattern?.test("12345678")).toBe(true);
    expect(councilSpec("MX", "CEDULA")?.numberPattern?.test("123")).toBe(false);
    expect(councilSpec("AR", "MATRICULA_PROVINCIAL")?.regionRequired).toBe(true);
    expect(councilSpec("US", "STATE_LICENSE")?.hasNpi).toBe(true);
    expect(councilSpec("BR", "NPI")).toBeUndefined();
    for (const code of COUNTRY_CODES) {
      const profile = countryProfile(code);
      expect(profile.councils.some((council) => council.type === "OTHER" && council.needsName)).toBe(true);
      expect(profile.paymentMethods).toContain("CASH");
      expect(profile.paymentMethods).toContain("OTHER");
    }
    expect(countryProfile("BR").paymentMethods).toContain("PIX");
    expect(countryProfile("PT").paymentMethods).toContain("MBWAY");
  });

  it("F16: every label key a profile uses exists in the three languages", () => {
    const keys = new Set<string>();
    for (const profile of Object.values(COUNTRY_PROFILES)) {
      keys.add(profile.nameKey);
      keys.add(profile.taxId.labelKey);
      keys.add(profile.address.postalCode.labelKey);
      keys.add(profile.address.region.labelKey);
      for (const document of profile.identityDocuments) keys.add(document.labelKey);
      for (const field of profile.address.fields) keys.add(field.labelKey);
      for (const council of profile.councils) keys.add(council.labelKey);
      for (const method of profile.paymentMethods) keys.add(`countries.paymentMethods.${method}`);
    }
    const missing: string[] = [];
    for (const [name, catalog] of [
      ["pt-BR", ptBR],
      ["en", en],
      ["es", es],
    ] as const) {
      for (const key of keys) if (!hasKey(catalog, key)) missing.push(`${name}: ${key}`);
    }
    expect(missing).toEqual([]);
  });
});
