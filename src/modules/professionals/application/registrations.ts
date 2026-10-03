import { createTranslator, type Translator } from "@/shared/i18n/translator";
import type { Locale } from "@/shared/i18n/locales";
import { councilSpec } from "@/shared/kernel/countries";
import { isCountryCode, type CountryCode } from "@/shared/kernel/countries/codes";
import { councilLabel, formatRegistration, type CouncilRegistration } from "../domain/council";

// A stored council registration with its readable text ("CRM 123456/SP") in a language.
export type RegistrationItem = CouncilRegistration & { formatted: string; label: string };

type RegistrationRow = {
  country: string;
  councilType: string;
  councilOtherName: string | null;
  number: string | null;
  region: string | null;
  npi: string | null;
};

// Registrations of countries the system no longer knows are skipped.
export function toRegistrations(rows: RegistrationRow[], locale: Locale): RegistrationItem[] {
  const t = createTranslator(locale);
  return rows.flatMap((row) => {
    if (!isCountryCode(row.country)) return [];
    const registration: CouncilRegistration = {
      country: row.country,
      councilType: row.councilType,
      councilOtherName: row.councilOtherName,
      number: row.number,
      region: row.region,
      npi: row.npi,
    };
    return [describeRegistration(registration, t)];
  });
}

export function describeRegistration(registration: CouncilRegistration, t: Translator): RegistrationItem {
  const spec = councilSpec(registration.country, registration.councilType);
  const label = councilLabel(registration, spec ? t(spec.labelKey) : registration.councilType);
  return { ...registration, label, formatted: formatRegistration(registration, label) };
}

// Registrations of a professional, ordered by country, to show in lists and headers.
export function registrationSummary(items: RegistrationItem[]): string {
  return [...items]
    .sort((a, b) => a.country.localeCompare(b.country))
    .map((item) => item.formatted)
    .filter(Boolean)
    .join(" · ");
}

export function countryOf(items: { country: CountryCode }[]): Set<CountryCode> {
  return new Set(items.map((item) => item.country));
}
