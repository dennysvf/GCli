// Local wall-clock time of IANA zones (ADR-021, moved here by ADR-026 so every module's domain can
// use it). Brazil has no daylight saving time since 2019, so a zone's offset is constant, but it is
// still read for a given instant so a future change stays local.

const DAY_MINUTES = 24 * 60;

// Minutes east of UTC, e.g. -180 for America/Sao_Paulo.
export function utcOffsetMinutes(timeZone: string, instant: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

// Instant of a local wall-clock time ("YYYY-MM-DDTHH:mm") in a time zone.
export function zonedTimeToUtc(local: string, timeZone: string): Date {
  const [date = "", time = "00:00"] = local.split("T");
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = asUtc - utcOffsetMinutes(timeZone, new Date(asUtc)) * 60_000;
  return new Date(asUtc - utcOffsetMinutes(timeZone, new Date(firstGuess)) * 60_000);
}

// Local wall-clock parts of an instant: "YYYY-MM-DD" and minutes from midnight.
export function utcToZonedParts(instant: Date, timeZone: string): { date: string; minute: number } {
  const local = new Date(instant.getTime() + utcOffsetMinutes(timeZone, instant) * 60_000);
  return {
    date: local.toISOString().slice(0, 10),
    minute: (local.getUTCHours() * 60 + local.getUTCMinutes()) % DAY_MINUTES,
  };
}

// Instant of a local date plus minutes from midnight (1440 is midnight of the next day).
export function localMinuteToUtc(date: string, minute: number, timeZone: string): Date {
  const midnight = zonedTimeToUtc(`${date}T00:00`, timeZone);
  return new Date(midnight.getTime() + minute * 60_000);
}
