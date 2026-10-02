import { describe, expect, it } from "vitest";
import { formatPhone, PhoneNumber } from "./phone";

describe("PhoneNumber", () => {
  it("F05: phone numbers accept Brazilian formats with area code", () => {
    const mobile = PhoneNumber.parse("(11) 98888-7777", { mobile: true });
    expect(mobile.ok && mobile.value.digits).toBe("11988887777");
    expect(mobile.ok && mobile.value.format()).toBe("(11) 98888-7777");
    expect(mobile.ok && mobile.value.lastDigits(4)).toBe("7777");

    expect(PhoneNumber.parse("(11) 3333-4444", { mobile: true }).ok).toBe(false);
    const landline = PhoneNumber.parse("(11) 3333-4444");
    expect(landline.ok && landline.value.format()).toBe("(11) 3333-4444");
    expect(landline.ok && landline.value.isMobile).toBe(false);

    expect(PhoneNumber.parse("98888-7777").ok).toBe(false);
    expect(PhoneNumber.parse("(01) 98888-7777").ok).toBe(false);
  });

  it("formats partial input while typing", () => {
    expect(formatPhone("1")).toBe("(1");
    expect(formatPhone("1198")).toBe("(11) 98");
    expect(formatPhone("1198888")).toBe("(11) 9888-8");
    expect(formatPhone("11988887777")).toBe("(11) 98888-7777");
  });
});
