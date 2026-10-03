import { describe, expect, it } from "vitest";
import { formatPhone, formatPhoneInput, formatPhoneNumber, isE164, PhoneNumber } from "./phone";

describe("PhoneNumber", () => {
  const e164 = (input: string, country: Parameters<typeof PhoneNumber.parse>[1]["defaultCountry"]) => {
    const parsed = PhoneNumber.parse(input, { defaultCountry: country });
    return parsed.ok ? parsed.value.e164 : parsed.error.code;
  };

  it("F16: phones are parsed to E.164 with the unit's default country", () => {
    expect(e164("(11) 98888-7777", "BR")).toBe("+5511988887777");
    expect(e164("(11) 3333-4444", "BR")).toBe("+551133334444");
    expect(e164("612 34 56 78", "ES")).toBe("+34612345678");
    expect(e164("912 345 678", "PT")).toBe("+351912345678");
    expect(e164("55 1234 5678", "MX")).toBe("+525512345678");
    expect(e164("11 2345-6789", "AR")).toBe("+541123456789");
    expect(e164("9 8765 4321", "CL")).toBe("+56987654321");
    expect(e164("321 234 5678", "CO")).toBe("+573212345678");
    expect(e164("(650) 253-0000", "US")).toBe("+16502530000");
  });

  it("F16: international input wins over the default country", () => {
    expect(e164("+34 612 34 56 78", "BR")).toBe("+34612345678");
    expect(e164("+55 11 98888-7777", "ES")).toBe("+5511988887777");
  });

  it("F16: invalid phones are rejected", () => {
    expect(e164("98888-7777", "BR")).toBe("PHONE_INVALID");
    expect(e164("(11) 8888-777", "BR")).toBe("PHONE_INVALID");
    expect(e164("123", "ES")).toBe("PHONE_INVALID");
    expect(e164("abc", "US")).toBe("PHONE_INVALID");
  });

  it("F16: countries that tell mobile from landline numbers apply the mobile rule", () => {
    const mobile = (input: string, country: Parameters<typeof PhoneNumber.parse>[1]["defaultCountry"]) =>
      PhoneNumber.parse(input, { defaultCountry: country, mobile: true }).ok;
    expect(mobile("(11) 98888-7777", "BR")).toBe(true);
    expect(mobile("(11) 3333-4444", "BR")).toBe(false);
    expect(mobile("612 34 56 78", "ES")).toBe(true);
    expect(mobile("912 34 56 78", "ES")).toBe(false);
    expect(mobile("912 345 678", "PT")).toBe(true);
    expect(mobile("212 345 678", "PT")).toBe(false);
    // The United States and Mexico do not distinguish them.
    expect(mobile("(650) 253-0000", "US")).toBe(true);
    expect(mobile("55 1234 5678", "MX")).toBe(true);
  });

  it("exposes the national digits and the country of a stored number", () => {
    const stored = PhoneNumber.fromE164("+5511988887777");
    expect(stored?.country).toBe("BR");
    expect(stored?.nationalDigits()).toBe("11988887777");
    expect(stored?.lastDigits(8)).toBe("88887777");
    expect(PhoneNumber.fromE164("11988887777")).toBeNull();
  });

  it("formats national inside the default country and international elsewhere", () => {
    expect(formatPhoneNumber("+5511988887777", "BR")).toBe("(11) 98888-7777");
    expect(formatPhoneNumber("+5511988887777", "ES")).toBe("+55 11 98888 7777");
    expect(formatPhoneNumber("+34612345678")).toBe("+34 612 34 56 78");
    expect(formatPhoneNumber("not a phone")).toBe("not a phone");
  });

  it("formats partial input as the user types", () => {
    expect(formatPhoneInput("1198", "BR")).toBe("(11) 98");
    expect(formatPhoneInput("11988887777", "BR")).toBe("(11) 98888-7777");
    expect(formatPhoneInput("612345678", "ES")).toBe("612 34 56 78");
  });

  it("checks the E.164 shape", () => {
    expect(isE164("+5511988887777")).toBe(true);
    expect(isE164("5511988887777")).toBe(false);
    expect(isE164("+0123456")).toBe(false);
  });
});

describe("legacy Brazilian digits", () => {
  it("formats stored digits until the E.164 migration is applied everywhere", () => {
    expect(formatPhone("1")).toBe("(1");
    expect(formatPhone("1198")).toBe("(11) 98");
    expect(formatPhone("1198888")).toBe("(11) 9888-8");
    expect(formatPhone("11988887777")).toBe("(11) 98888-7777");
  });
});
