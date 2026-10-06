import { describe, expect, it } from "vitest";
import { inviteUserSchema, updateOrganizationSchema } from "./schemas";

const base = {
  legalName: "Clínica Ltda",
  country: "BR",
  defaultLocale: "pt-BR",
  timeZone: "America/Sao_Paulo",
  slotGranularityMinutes: 15,
  version: 1,
};

describe("updateOrganizationSchema", () => {
  it("F01: optional fields accept empty, missing, or null values (restored drafts)", () => {
    for (const value of ["", undefined, null]) {
      const parsed = updateOrganizationSchema.safeParse({ ...base, tradeName: value, taxId: value });
      expect(parsed.success, String(value)).toBe(true);
      expect(parsed.data).toMatchObject({ tradeName: null, taxId: null });
    }
  });

  it("F16: the headquarters country, language and time zone are validated together", () => {
    expect(
      updateOrganizationSchema.safeParse({ ...base, country: "PT", timeZone: "Europe/Lisbon" }).success,
    ).toBe(true);
    const wrongZone = updateOrganizationSchema.safeParse({ ...base, country: "PT" });
    expect(wrongZone.success).toBe(false);
    expect(wrongZone.error?.issues[0]?.path).toEqual(["timeZone"]);
    expect(updateOrganizationSchema.safeParse({ ...base, country: "FR" }).success).toBe(false);
    expect(
      updateOrganizationSchema.safeParse({ ...base, defaultLocale: "fr" }).error?.issues[0]?.message,
    ).toBe("validation.localeInvalid");
  });
});

describe("inviteUserSchema", () => {
  it("F16: the invitation language is optional and limited to the three languages", () => {
    const person = { name: "Ana Lima", email: "Ana@Exemplo.com", role: "MANAGER" };
    expect(inviteUserSchema.parse(person)).toMatchObject({ email: "ana@exemplo.com" });
    expect(inviteUserSchema.parse({ ...person, locale: "es" }).locale).toBe("es");
    expect(inviteUserSchema.safeParse({ ...person, locale: "fr" }).success).toBe(false);
  });
});
