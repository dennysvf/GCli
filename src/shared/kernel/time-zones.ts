// Brazilian IANA time zones offered for the organization (F01) and for each unit (F02, ADR-019).
export const BRAZIL_TIME_ZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Eirunepe",
  "America/Belem",
  "America/Santarem",
  "America/Araguaina",
  "America/Fortaleza",
  "America/Recife",
  "America/Maceio",
  "America/Bahia",
  "America/Noronha",
] as const;

export type BrazilTimeZone = (typeof BRAZIL_TIME_ZONES)[number];

export function timeZoneLabel(zone: string): string {
  return zone.replace("America/", "").replaceAll("_", " ");
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
