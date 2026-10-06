import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, type CountryCode } from "./countries/codes";
import { formatTaxId, normalizeTaxId, taxIdSpec, validateTaxId } from "./tax-id";

const SAMPLES: Record<CountryCode, { valid: string[]; invalid: string[] }> = {
  BR: {
    // Numeric and alphanumeric CNPJ (alphanumeric ones are issued from July 2026).
    valid: ["11.222.333/0001-81", "12.ABC.345/01DE-35"],
    invalid: ["11.222.333/0001-82", "11.111.111/1111-11", "123"],
  },
  PT: { valid: ["123456789", "501234560"], invalid: ["123456780", "423456789"] },
  ES: {
    // NIF of a person, NIE, and CIF with a digit, a letter or either as control.
    valid: ["12345678Z", "X1234567L", "A58585852", "B12345674", "Q2826000H"],
    invalid: ["12345678A", "A58585853", "Q28260008", "ZZ"],
  },
  MX: {
    valid: ["XAXX010101000", "GODE561231GR8", "ABC8501019A1"],
    invalid: ["XAXX010101", "XAXX011301000", "1234"],
  },
  AR: { valid: ["30-71234567-1", "20-12345678-6"], invalid: ["30-71234567-2", "11-71234567-1"] },
  CL: { valid: ["12.345.678-5", "10.000.013-K"], invalid: ["12.345.678-9", "123"] },
  CO: { valid: ["900.123.456-8", "800.197.268-4"], invalid: ["900.123.456-9", "12"] },
  US: { valid: ["12-3456789", "123456789"], invalid: ["12-345678", "AB-3456789"] },
};

describe("tax IDs", () => {
  it("F16: tax IDs are validated per country", () => {
    for (const country of COUNTRY_CODES) {
      for (const value of SAMPLES[country].valid) {
        expect(validateTaxId(country, value), `${country} ${value} should be valid`).toBe(true);
      }
      for (const value of SAMPLES[country].invalid) {
        expect(validateTaxId(country, value), `${country} ${value} should be invalid`).toBe(false);
      }
    }
  });

  it("normalizes and formats per country", () => {
    expect(normalizeTaxId("BR", "11.222.333/0001-81")).toBe("11222333000181");
    expect(formatTaxId("BR", "11222333000181")).toBe("11.222.333/0001-81");
    expect(formatTaxId("AR", "30712345671")).toBe("30-71234567-1");
    expect(formatTaxId("CL", "123456785")).toBe("12.345.678-5");
    expect(formatTaxId("CO", "9001234568")).toBe("900.123.456-8");
    expect(formatTaxId("US", "123456789")).toBe("12-3456789");
    expect(formatTaxId("US", "1")).toBe("1");
  });

  it("each country has one tax ID spec with a catalog label", () => {
    for (const country of COUNTRY_CODES) {
      const spec = taxIdSpec(country);
      expect(spec.country).toBe(country);
      expect(spec.labelKey).toBe(`countries.taxIds.${spec.type}`);
    }
  });
});
