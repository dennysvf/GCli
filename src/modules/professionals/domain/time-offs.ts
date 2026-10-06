import { addDays } from "./dates";
import { TIME_OFF_MAX_DAYS_AHEAD, TIME_OFF_MIN_MINUTES } from "./limits";
import { zonedTimeToUtc } from "./time-zone-offsets";

// Time-offs (PRD F04): a date/time range with a type, up to 1 year ahead. Entered in the
// organization's time zone and stored as instants (spec F04 section 3).
export const TIME_OFF_TYPES = ["VACATION", "CONFERENCE", "PERSONAL", "OTHER"] as const;
export type TimeOffType = (typeof TIME_OFF_TYPES)[number];

export type TimeOffEntry = { allDay: boolean; startsAt: string; endsAt: string };

// All-day entries are dates ("2026-12-21" to "2027-01-04", last day inclusive) and cover 00:00 of
// the first day to 24:00 of the last. Other entries are local date-times ("2026-12-21T08:00").
export function timeOffRange(entry: TimeOffEntry, timeZone: string): { startsAt: Date; endsAt: Date } {
  if (entry.allDay) {
    return {
      startsAt: zonedTimeToUtc(`${entry.startsAt}T00:00`, timeZone),
      endsAt: zonedTimeToUtc(`${addDays(entry.endsAt, 1)}T00:00`, timeZone),
    };
  }
  return {
    startsAt: zonedTimeToUtc(entry.startsAt, timeZone),
    endsAt: zonedTimeToUtc(entry.endsAt, timeZone),
  };
}

export type TimeOffProblem = "TOO_SHORT" | "ENDS_IN_PAST" | "TOO_FAR";

export function checkTimeOff(range: { startsAt: Date; endsAt: Date }, now: Date): TimeOffProblem | null {
  if (range.endsAt.getTime() - range.startsAt.getTime() < TIME_OFF_MIN_MINUTES * 60_000) return "TOO_SHORT";
  if (range.endsAt <= now) return "ENDS_IN_PAST";
  if (range.endsAt.getTime() > now.getTime() + TIME_OFF_MAX_DAYS_AHEAD * 86_400_000) return "TOO_FAR";
  return null;
}

// Ended time-offs are history; current and upcoming ones can still be removed.
export function isTimeOffDeletable(endsAt: Date, now: Date): boolean {
  return endsAt > now;
}
