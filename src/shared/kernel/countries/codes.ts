// Supported countries and currencies (PRD F16, ADR-029). The full profiles live next to this file;
// these codes are separate so low-level helpers (formatting, money) do not depend on the profiles.
export const COUNTRY_CODES = ["BR", "PT", "ES", "MX", "AR", "CL", "CO", "US"] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export const CURRENCIES = ["BRL", "EUR", "MXN", "ARS", "CLP", "COP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

const CURRENCY_OF_COUNTRY: Record<CountryCode, Currency> = {
  BR: "BRL",
  PT: "EUR",
  ES: "EUR",
  MX: "MXN",
  AR: "ARS",
  CL: "CLP",
  CO: "COP",
  US: "USD",
};

// Digits after the decimal separator (ISO 4217 minor units). The Chilean peso has none.
const MINOR_UNITS: Record<Currency, number> = {
  BRL: 2,
  EUR: 2,
  MXN: 2,
  ARS: 2,
  CLP: 0,
  COP: 2,
  USD: 2,
};

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && (COUNTRY_CODES as readonly string[]).includes(value);
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

export function currencyOf(country: CountryCode): Currency {
  return CURRENCY_OF_COUNTRY[country];
}

export function minorUnits(currency: Currency): number {
  return MINOR_UNITS[currency];
}
