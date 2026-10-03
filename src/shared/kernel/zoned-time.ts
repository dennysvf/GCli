// Local wall-clock time of IANA zones (ADR-021, moved here by ADR-026, made daylight-saving-correct
// by ADR-030). Every "local date + local time -> instant" conversion goes through zonedTimeToUtc.

const DAY_MINUTES = 24 * 60;
const MINUTE_MS = 60_000;
const DAY_MS = DAY_MINUTES * MINUTE_MS;

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

// Instant of a local wall-clock time ("YYYY-MM-DDTHH:mm") in a time zone, with the rules of
// ADR-030 for the two hours a year when the clock does not map one-to-one to instants:
// - a local time that does not exist (spring forward, 02:30 when 02:00 jumps to 03:00) moves
//   forward by the gap, to 03:30;
// - a local time that happens twice (fall back) takes the earlier instant.
export function zonedTimeToUtc(local: string, timeZone: string): Date {
  const [date = "", time = "00:00"] = local.split("T");
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  // The wall clock read as if it were UTC; real instants differ from it by the zone's offset.
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetBefore = utcOffsetMinutes(timeZone, new Date(wallAsUtc - DAY_MS));
  const offsetAfter = utcOffsetMinutes(timeZone, new Date(wallAsUtc + DAY_MS));

  // An offset is valid when the instant it produces really shows that wall-clock time.
  const candidates = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => wallAsUtc - offset * MINUTE_MS)
    .filter((instant) => {
      const offset = utcOffsetMinutes(timeZone, new Date(instant));
      return instant + offset * MINUTE_MS === wallAsUtc;
    });
  if (candidates.length > 0) return new Date(Math.min(...candidates));
  // Gap: the pre-change offset puts the instant after the change, which shows the later time.
  return new Date(wallAsUtc - offsetBefore * MINUTE_MS);
}

// Local wall-clock parts of an instant: "YYYY-MM-DD" and minutes from midnight.
export function utcToZonedParts(instant: Date, timeZone: string): { date: string; minute: number } {
  const local = new Date(instant.getTime() + utcOffsetMinutes(timeZone, instant) * MINUTE_MS);
  return {
    date: local.toISOString().slice(0, 10),
    minute: (local.getUTCHours() * 60 + local.getUTCMinutes()) % DAY_MINUTES,
  };
}

// Instant of a local date plus minutes from midnight (1440 is midnight of the next day). The
// minutes count on the wall clock, so 09:00 stays 09:00 on the days the clock changes.
export function localMinuteToUtc(date: string, minute: number, timeZone: string): Date {
  const wall = new Date(Date.parse(`${date}T00:00:00Z`) + minute * MINUTE_MS);
  return zonedTimeToUtc(wall.toISOString().slice(0, 16), timeZone);
}

// Calendar date after adding days to a "YYYY-MM-DD" date (calendar arithmetic, no time zone).
export function addCalendarDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
