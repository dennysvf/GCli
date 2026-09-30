import { describe, expect, it } from "vitest";
import { updateOrganizationSchema } from "./schemas";

const base = {
  legalName: "Clínica Ltda",
  timeZone: "America/Sao_Paulo",
  slotGranularityMinutes: 15,
  version: 1,
};

describe("updateOrganizationSchema", () => {
  it("F01: optional fields accept empty, missing, or null values (restored drafts)", () => {
    for (const value of ["", undefined, null]) {
      const parsed = updateOrganizationSchema.safeParse({ ...base, tradeName: value, cnpj: value });
      expect(parsed.success, String(value)).toBe(true);
      expect(parsed.data).toMatchObject({ tradeName: null, cnpj: null });
    }
  });

  it("normalizes the CNPJ mask", () => {
    const parsed = updateOrganizationSchema.parse({ ...base, cnpj: "12.abc.345/01de-35" });
    expect(parsed.cnpj).toBe("12ABC34501DE35");
  });
});
