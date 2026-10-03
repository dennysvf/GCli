// Country profiles (PRD F16, ADR-029): one reviewed file per country. A profile is data and rules,
// not text; labels are catalog keys translated by the interface.
import { AR } from "./ar";
import { BR } from "./br";
import { CL } from "./cl";
import { CO } from "./co";
import { COUNTRY_CODES, type CountryCode } from "./codes";
import { ES } from "./es";
import { MX } from "./mx";
import { PT } from "./pt";
import type { CountryProfile } from "./types";
import { US } from "./us";

export { COUNTRY_CODES, CURRENCIES, currencyOf, isCountryCode, isCurrency, minorUnits } from "./codes";
export type { CountryCode, Currency } from "./codes";
export type {
  AddressFieldName,
  AddressSpec,
  CouncilSpec,
  CountryProfile,
  PaymentMethod,
  Region,
} from "./types";
export { BRAZIL_REGIONS, BRAZIL_TIME_ZONES } from "./br";

export const COUNTRY_PROFILES: Record<CountryCode, CountryProfile> = { BR, PT, ES, MX, AR, CL, CO, US };

export function countryProfile(code: CountryCode): CountryProfile {
  return COUNTRY_PROFILES[code];
}

export function isTimeZoneOf(country: CountryCode, timeZone: string): boolean {
  return countryProfile(country).timeZones.includes(timeZone);
}

export function councilSpec(country: CountryCode, type: string) {
  return countryProfile(country).councils.find((council) => council.type === type);
}

// Countries ordered as the interface lists them.
export const COUNTRY_LIST: readonly CountryProfile[] = COUNTRY_CODES.map(countryProfile);
