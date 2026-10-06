// Phone numbers (PRD F16, ADR-029): stored in E.164 and validated with libphonenumber-js (minimal
// metadata). The country profile adds the mobile rule for countries that distinguish mobile from
// landline numbers. The caller supplies the default country, usually the unit's.
import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/min";
import { COUNTRY_CODES, type CountryCode } from "./countries/codes";
import { countryProfile } from "./countries";
import { domainError } from "./errors";
import { fail, ok, type Result } from "./result";

export const E164_PATTERN = /^\+[1-9][0-9]{6,14}$/;

// The eight supported countries have distinct calling codes; +1 is also Canada's, which maps to
// the United States because only the United States is supported.
function countryOfCallingCode(callingCode: string): CountryCode | null {
  return COUNTRY_CODES.find((code) => countryProfile(code).phoneCode === callingCode) ?? null;
}

export class PhoneNumber {
  private constructor(
    readonly e164: string,
    readonly country: CountryCode | null,
    private readonly national: string,
  ) {}

  // Accepts national or international input. `mobile: true` also requires a mobile number in the
  // countries that tell them apart.
  static parse(
    input: string,
    options: { defaultCountry: CountryCode; mobile?: boolean },
  ): Result<PhoneNumber> {
    const parsed = parsePhoneNumberFromString(input.trim(), options.defaultCountry);
    if (!parsed?.isValid()) return fail(domainError("PHONE_INVALID", 400));
    const country = countryOfCallingCode(parsed.countryCallingCode);
    const phone = new PhoneNumber(parsed.number, country, parsed.nationalNumber);
    const shape = country ? countryProfile(country).nationalPattern : undefined;
    if (shape && !shape.test(parsed.nationalNumber)) return fail(domainError("PHONE_INVALID", 400));
    if (options.mobile && !phone.isMobile()) return fail(domainError("PHONE_INVALID", 400));
    return ok(phone);
  }

  // Parses a value that is already stored, without a default country.
  static fromE164(value: string): PhoneNumber | null {
    if (!E164_PATTERN.test(value)) return null;
    const parsed = parsePhoneNumberFromString(value);
    if (!parsed) return null;
    return new PhoneNumber(
      parsed.number,
      countryOfCallingCode(parsed.countryCallingCode),
      parsed.nationalNumber,
    );
  }

  // Countries without a mobile rule accept any valid number.
  isMobile(): boolean {
    const pattern = this.country ? countryProfile(this.country).mobilePattern : undefined;
    return pattern ? pattern.test(this.national) : true;
  }

  // National significant number, the digits the search by "last 8 digits" compares.
  nationalDigits(): string {
    return this.national;
  }

  lastDigits(count: number): string {
    return this.national.slice(-count);
  }

  // National format inside the default country ("(11) 98888-7777"), international elsewhere.
  format(defaultCountry?: CountryCode): string {
    return formatPhoneNumber(this.e164, defaultCountry);
  }
}

export function isE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

export function formatPhoneNumber(e164: string, defaultCountry?: CountryCode): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  const sameCountry =
    defaultCountry && parsed.countryCallingCode === countryProfile(defaultCountry).phoneCode;
  return sameCountry ? parsed.formatNational() : parsed.formatInternational();
}

// Partial input formatted as far as it goes, in the default country (used by the masked input).
export function formatPhoneInput(input: string, country: CountryCode): string {
  return new AsYouType(country).input(input);
}

// Calling code of a country, for the country selector of the phone input.
export function phoneCodeOf(country: CountryCode): string {
  return countryProfile(country).phoneCode;
}

// Brazilian digits ("11988887777") as they were stored before F16 moved phones to E.164.
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length > 0 ? `(${digits}` : "";
  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) return `(${area}) ${rest}`;
  const split = digits.length === 11 ? 5 : 4;
  return `(${area}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}
