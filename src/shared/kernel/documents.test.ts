import { describe, expect, it } from "vitest";
import {
  DOCUMENT_SPECS,
  DOCUMENT_TYPES,
  formatDocument,
  maskDocument,
  normalizeDocument,
  validateDocument,
  type DocumentType,
} from "./documents";

const SAMPLES: Record<DocumentType, { valid: string[]; invalid: string[] }> = {
  CPF: { valid: ["529.982.247-25", "52998224725"], invalid: ["111.111.111-11", "529.982.247-26", "123"] },
  NIF_PT: { valid: ["123456789", "123 456 789"], invalid: ["123456780", "423456789", "12345678"] },
  DNI_ES: { valid: ["12345678Z", "12345678z"], invalid: ["12345678A", "1234567Z", "123456789"] },
  NIE_ES: { valid: ["X1234567L", "x-1234567-l"], invalid: ["X1234567A", "A1234567L", "X123456L"] },
  CURP: { valid: ["HEGG560427MVZRRL04"], invalid: ["HEGG560427MVZRRL05", "HEGG560427XVZRRL04", "HEGG5604"] },
  DNI_AR: { valid: ["12345678", "12.345.678", "1234567"], invalid: ["123456", "123456789", "1234567A"] },
  CUIT_AR: {
    valid: ["20-12345678-6", "30712345671"],
    invalid: ["20-12345678-5", "10-12345678-6", "2012345"],
  },
  RUT_CL: {
    valid: ["12.345.678-5", "10.000.013-K", "10.000.013-k"],
    invalid: ["12.345.678-9", "10.000.013-5", "1234"],
  },
  CC_CO: { valid: ["1234567890", "1.234.567.890", "123456"], invalid: ["12345", "12345678901", "12A456"] },
  CE_CO: { valid: ["1234567", "123456"], invalid: ["12345", "12345678"] },
  US_DL: { valid: ["D123-4567-8901", "A1234567"], invalid: ["AB", "A1234567890123456789012", "A12 !"] },
};

describe("identity documents", () => {
  it("F16: identity documents are validated per type", () => {
    for (const type of DOCUMENT_TYPES) {
      for (const value of SAMPLES[type].valid) {
        expect(validateDocument(type, value), `${type} ${value} should be valid`).toBe(true);
      }
      for (const value of SAMPLES[type].invalid) {
        expect(validateDocument(type, value), `${type} ${value} should be invalid`).toBe(false);
      }
    }
  });

  it("normalizes to upper case without punctuation", () => {
    expect(normalizeDocument("CPF", "529.982.247-25")).toBe("52998224725");
    expect(normalizeDocument("DNI_ES", "12345678-z")).toBe("12345678Z");
    expect(normalizeDocument("RUT_CL", "10.000.013-k")).toBe("10000013K");
    expect(normalizeDocument("US_DL", "d123 4567-8901")).toBe("D12345678901");
  });

  it("formats documents, even while they are typed", () => {
    expect(formatDocument("CPF", "52998224725")).toBe("529.982.247-25");
    expect(formatDocument("CPF", "5299")).toBe("529.9");
    expect(formatDocument("RUT_CL", "123456785")).toBe("12.345.678-5");
    expect(formatDocument("CUIT_AR", "20123456786")).toBe("20-12345678-6");
    expect(formatDocument("DNI_AR", "12345678")).toBe("12.345.678");
    expect(formatDocument("CC_CO", "1234567890")).toBe("1.234.567.890");
    expect(formatDocument("NIF_PT", "123456789")).toBe("123 456 789");
    expect(formatDocument("DNI_ES", "12345678z")).toBe("12345678Z");
  });

  it("F16: documents are masked for Front Desk per type", () => {
    expect(maskDocument("CPF", "529.982.247-25")).toBe("***.***.247-25");
    expect(maskDocument("DNI_ES", "12345678Z")).toBe("•••678Z");
    expect(maskDocument("RUT_CL", "12.345.678-5")).toBe("•••6785");
    expect(maskDocument("CE_CO", "123")).toBe("123");
  });

  it("every spec names its country, label key and short label", () => {
    for (const type of DOCUMENT_TYPES) {
      const spec = DOCUMENT_SPECS[type];
      expect(spec.type).toBe(type);
      expect(spec.labelKey).toBe(`countries.documents.${type}`);
      expect(spec.shortLabel.length).toBeGreaterThan(0);
    }
  });
});
