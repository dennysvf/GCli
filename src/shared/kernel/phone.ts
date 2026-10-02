import { domainError } from "./errors";
import { fail, ok, type Result } from "./result";

// Brazilian phone number value object (architecture 11.2). Stored as digits with the area code:
// 10 digits for landlines, 11 for mobiles (the number after the area code starts with 9).
export class PhoneNumber {
  private constructor(readonly digits: string) {}

  static parse(input: string, options: { mobile?: boolean } = {}): Result<PhoneNumber> {
    const digits = input.replace(/\D/g, "");
    const valid = options.mobile ? isMobile(digits) : /^\d{10,11}$/.test(digits);
    if (!valid || digits.startsWith("0")) return fail(domainError("PHONE_INVALID", 400));
    return ok(new PhoneNumber(digits));
  }

  get isMobile(): boolean {
    return isMobile(this.digits);
  }

  format(): string {
    return formatPhone(this.digits);
  }

  lastDigits(count: number): string {
    return this.digits.slice(-count);
  }
}

function isMobile(digits: string): boolean {
  return /^\d{2}9\d{8}$/.test(digits);
}

// "(11) 98888-7777" or "(11) 3333-4444"; partial input is formatted as far as it goes.
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : "";
  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${area}) ${rest}`;
  const split = digits.length === 11 ? 5 : 4;
  return `(${area}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}
