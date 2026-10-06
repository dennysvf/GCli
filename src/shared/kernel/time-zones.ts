// The zone lists live in the country profiles (PRD F16); Brazil's list stays exported for the
// features written before the profiles existed.
import { BRAZIL_TIME_ZONES } from "./countries/br";

export { BRAZIL_TIME_ZONES };
export type BrazilTimeZone = (typeof BRAZIL_TIME_ZONES)[number];

// "America/Argentina/Buenos_Aires" -> "Buenos Aires": the city is the last path segment.
export function timeZoneLabel(zone: string): string {
  return (zone.split("/").at(-1) ?? zone).replaceAll("_", " ");
}

// Calendar date (YYYY-MM-DD) of an instant in a time zone.
export function dateInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
