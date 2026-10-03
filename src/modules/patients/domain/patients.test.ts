import { describe, expect, it } from "vitest";
import { ageOn, isMinor } from "./age";
import { consentStatus, isRecordComplete } from "./consent";
import { maskDocument } from "@/shared/kernel/documents";
import { phoneEnd } from "./masking";
import { abbreviateName, displayName, normalizeName } from "./names";
import { phoneDigits } from "./patient-fields";
import { classifySearchTerm } from "./search-term";

describe("patient names", () => {
  it("F05: names are normalized without accents and case", () => {
    expect(normalizeName("  JOSÉ   da Silva ")).toBe("jose da silva");
    expect(normalizeName("João Conceição")).toBe("joao conceicao");
  });

  it("F05: the document message abbreviates the existing patient's name", () => {
    expect(abbreviateName("Maria Silva Oliveira")).toBe("Maria S. Oliveira");
    expect(abbreviateName("Ana Maria dos Santos Costa")).toBe("Ana M. S. Costa");
    expect(abbreviateName("Pedro Alves")).toBe("Pedro Alves");
  });

  it("F05: social name is displayed instead of the full name", () => {
    expect(displayName("João Pedro Silva", "Joana Silva")).toBe("Joana Silva");
    expect(displayName("João Pedro Silva", "  ")).toBe("João Pedro Silva");
    expect(displayName("João Pedro Silva", null)).toBe("João Pedro Silva");
  });
});

describe("ages", () => {
  it("F05: age and minority use the organization's today", () => {
    expect(ageOn("2008-10-01", "2026-10-01")).toBe(18);
    expect(isMinor("2008-10-01", "2026-10-01")).toBe(false);
    expect(isMinor("2008-10-02", "2026-10-01")).toBe(true);
    expect(ageOn("1988-04-12", "2026-04-11")).toBe(37);
    expect(ageOn("1988-04-12", "2026-04-12")).toBe(38);
  });
});

describe("search terms", () => {
  it("F05: search terms are classified as name, document or phone", () => {
    expect(classifySearchTerm("Már")).toEqual({ kind: "name", value: "mar" });
    expect(classifySearchTerm("529.982.247-25")).toEqual({ kind: "document-or-phone", value: "52998224725" });
    expect(classifySearchTerm("(11) 98888-7777")).toEqual({
      kind: "document-or-phone",
      value: "11988887777",
    });
    expect(classifySearchTerm("8888-7777")).toEqual({ kind: "document-or-phone", value: "88887777" });
    expect(classifySearchTerm("8888")).toEqual({ kind: "phone", value: "8888" });
    expect(classifySearchTerm("ab")).toEqual({ kind: "too-short" });
    expect(classifySearchTerm("  a b ")).toEqual({ kind: "too-short" });
  });

  it("F16: patient search terms recognize documents of any type", () => {
    expect(classifySearchTerm("12345678Z")).toEqual({ kind: "document", value: "12345678Z" });
    expect(classifySearchTerm("12.345.678-5")).toEqual({ kind: "document-or-phone", value: "123456785" });
    expect(classifySearchTerm("x-1234567-l")).toEqual({ kind: "document", value: "X1234567L" });
    expect(classifySearchTerm("Mar")).toEqual({ kind: "name", value: "mar" });
    // A name with a digit but fewer than 5 characters is still a name.
    expect(classifySearchTerm("Ana 2")).toEqual({ kind: "name", value: "ana 2" });
  });
});

describe("consent and masking", () => {
  it("F05: consent status follows the current terms version", () => {
    expect(consentStatus(2, 2)).toBe("OK");
    expect(consentStatus(1, 2)).toBe("PENDING");
    expect(consentStatus(null, 2)).toBe("MISSING");
    expect(consentStatus(null, null)).toBe("NO_TERMS");
    expect(isRecordComplete("52998224725", "OK")).toBe(true);
    expect(isRecordComplete(null, "OK")).toBe(false);
    expect(isRecordComplete("52998224725", "PENDING")).toBe(false);
  });

  it("F05: CPF is masked except the last 5 digits", () => {
    expect(maskDocument("CPF", "52998224725")).toBe("***.***.247-25");
    expect(phoneEnd("+5511988887777")).toBe("7777");
  });

  it("F16: other documents are masked except their last 4 characters", () => {
    expect(maskDocument("DNI_ES", "12345678Z")).toBe("•••678Z");
  });

  it("F16: the phone search column holds the national numbers of both phones", () => {
    expect(phoneDigits("+5511988887777", null)).toBe("11988887777");
    expect(phoneDigits("+5511988887777", "+551133334444")).toBe("11988887777 1133334444");
    expect(phoneDigits("+34612345678", null)).toBe("612345678");
  });
});
