import { isoWeekday } from "@/shared/kernel/calendar-date";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import { localMinuteToUtc, utcToZonedParts } from "@/shared/kernel/zoned-time";
import { DAY_MINUTES, LATENESS_MINUTES, UNDO_WINDOW_MINUTES } from "./limits";
import type { AppointmentStatus } from "./status";

// Local time of the agenda (ADR-019: the unit's time zone) and the time rules of the lifecycle.

// PRD F01: the start time follows the organization's slot granularity.
export function isAlignedStart(startMinute: number, granularity: number): boolean {
  return startMinute >= 0 && startMinute < DAY_MINUTES && startMinute % granularity === 0;
}

export function rangeAt(
  date: string,
  startMinute: number,
  durationMinutes: number,
  timeZone: string,
): DateTimeRange {
  return DateTimeRange.ofMinutes(localMinuteToUtc(date, startMinute, timeZone), durationMinutes);
}

// Local date, weekday and minutes of a range in the unit's zone. A range that crosses midnight
// ends after 1440, so "inside an interval" checks reject it (Brazil has no DST, ADR-021).
export function localSpan(range: DateTimeRange, timeZone: string) {
  const start = utcToZonedParts(range.start, timeZone);
  return {
    date: start.date,
    weekday: isoWeekday(start.date),
    start: start.minute,
    end: start.minute + range.minutes,
  };
}

// "14:30" in the unit's zone.
export function localTime(instant: Date, timeZone: string): string {
  const { minute } = utcToZonedParts(instant, timeZone);
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 60_000;
}

// PRD F06: undo check-in (and, by spec F06, the professional's completion reversal) within 30 min.
export function withinUndoWindow(changedAt: Date, now: Date): boolean {
  return minutesBetween(changedAt, now) <= UNDO_WINDOW_MINUTES;
}

// Design system 10.1: late when not checked in 10 minutes after the start.
export function latenessMinutes(status: AppointmentStatus, startsAt: Date, now: Date): number | null {
  if (status !== "SCHEDULED" && status !== "CONFIRMED") return null;
  const late = Math.floor(minutesBetween(startsAt, now));
  return late > LATENESS_MINUTES ? late : null;
}
