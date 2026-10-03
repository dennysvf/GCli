import type { CountryCode } from "@/shared/kernel/countries/codes";

// Council registrations (PRD F04 and F16): one per country, with the types each country's profile
// offers (CRM and CRO in Brazil, Ordem dos Médicos in Portugal, state license and NPI in the US).
// "Outro" needs the council's name; the US NPI is stored next to the state license.
export type CouncilRegistration = {
  country: CountryCode;
  councilType: string;
  councilOtherName: string | null;
  number: string | null;
  region: string | null;
  npi: string | null;
};

// The label printed before the number: the council's name for "Outro", else the label of the type
// (an acronym in Brazil, the name of the order or college elsewhere).
export function councilLabel(
  registration: Pick<CouncilRegistration, "councilType" | "councilOtherName">,
  typeLabel: string,
): string {
  return registration.councilType === "OTHER" ? (registration.councilOtherName ?? "") : typeLabel;
}

// "CRM 123456/SP"; the US NPI is appended ("State license 1234/NY · NPI 1234567893").
export function formatRegistration(registration: CouncilRegistration, label: string): string {
  const parts: string[] = [];
  if (registration.number) {
    parts.push(`${label} ${registration.number}${registration.region ? `/${registration.region}` : ""}`);
  }
  if (registration.npi) parts.push(`NPI ${registration.npi}`);
  return parts.join(" · ");
}

// Up to two initials for the avatar: first and last word of the name ("Ana Paula Lima" → "AL").
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !/^(dr|dra|prof|profa)\.?$/i.test(word));
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}
