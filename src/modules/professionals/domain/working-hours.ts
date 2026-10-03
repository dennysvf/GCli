import { addCalendarDays, localMinuteToUtc } from "@/shared/kernel/zoned-time";
import { DAY_MINUTES, MAX_INTERVALS_PER_UNIT_DAY, MINUTE_GRANULARITY } from "./limits";

// Working-hour intervals (PRD F04): per unit and ISO weekday (1 = Monday … 7 = Sunday), minutes
// from midnight in the unit's local time, 5-minute granularity, at most 4 per unit and day.
export type WorkingInterval = { unitId: string; weekday: number; start: number; end: number };

// A unit's business hours for one weekday, as F02 provides them.
export type BusinessDay = { weekday: number; open: boolean; intervals: { start: number; end: number }[] };

// Field errors keyed `intervals.<index>`, the form's field paths.
export type IntervalErrors = Record<string, string>;

// Catalog keys (professionals.validation.intervals.*); the form translates them next to each interval.
export const INTERVAL_MESSAGES = {
  weekday: "professionals.validation.intervals.weekday",
  range: "professionals.validation.intervals.range",
  granularity: "professionals.validation.intervals.granularity",
  tooMany: "professionals.validation.intervals.tooMany",
  overlap: "professionals.validation.intervals.overlap",
} as const;

function key(index: number): string {
  return `intervals.${index}`;
}

// Shape rules within one unit and day. Cross-unit and business-hours rules are separate checks
// because their messages need data (unit names, the unit's hours) that the application provides.
export function validateIntervals(intervals: WorkingInterval[]): IntervalErrors | null {
  const errors: IntervalErrors = {};
  const groups = new Map<string, number[]>();

  intervals.forEach((interval, index) => {
    if (!Number.isInteger(interval.weekday) || interval.weekday < 1 || interval.weekday > 7) {
      errors[key(index)] = INTERVAL_MESSAGES.weekday;
      return;
    }
    if (interval.start < 0 || interval.end > DAY_MINUTES || interval.start >= interval.end) {
      errors[key(index)] = INTERVAL_MESSAGES.range;
      return;
    }
    if (interval.start % MINUTE_GRANULARITY !== 0 || interval.end % MINUTE_GRANULARITY !== 0) {
      errors[key(index)] = INTERVAL_MESSAGES.granularity;
      return;
    }
    const group = `${interval.unitId}:${interval.weekday}`;
    groups.set(group, [...(groups.get(group) ?? []), index]);
  });

  for (const indexes of groups.values()) {
    for (const index of indexes.slice(MAX_INTERVALS_PER_UNIT_DAY))
      errors[key(index)] = INTERVAL_MESSAGES.tooMany;
    const sorted = [...indexes].sort((a, b) => (intervals[a]?.start ?? 0) - (intervals[b]?.start ?? 0));
    for (let i = 1; i < sorted.length; i++) {
      const previousIndex = sorted[i - 1] ?? 0;
      const currentIndex = sorted[i] ?? 0;
      const previous = intervals[previousIndex];
      const current = intervals[currentIndex];
      if (previous && current && current.start < previous.end) {
        errors[key(currentIndex)] ??= INTERVAL_MESSAGES.overlap;
      }
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

// True when [start, end) lies entirely inside one open interval of the day. Same rule as F02's
// isWithinHours, kept here so the domain stays free of other modules.
export function isWithinBusinessHours(day: BusinessDay | undefined, start: number, end: number): boolean {
  if (!day?.open) return false;
  return day.intervals.some((interval) => interval.start <= start && end <= interval.end);
}

export type OutsideBusinessHours = {
  index: number;
  unitId: string;
  weekday: number;
  day: BusinessDay | undefined;
};

// PRD F04: working hours outside the unit's business hours are rejected. Returns every offending
// interval so the grid can mark each one.
export function findOutsideBusinessHours(
  intervals: WorkingInterval[],
  unitWeeks: Map<string, BusinessDay[]>,
): OutsideBusinessHours[] {
  return intervals.flatMap((interval, index) => {
    const day = unitWeeks.get(interval.unitId)?.find((item) => item.weekday === interval.weekday);
    return isWithinBusinessHours(day, interval.start, interval.end)
      ? []
      : [{ index, unitId: interval.unitId, weekday: interval.weekday, day }];
  });
}

export type CrossUnitConflict = { index: number; conflictWith: number; date: string };

// PRD F16, ADR-030: the check covers the first 53 weeks of the schedule.
export const CROSS_UNIT_HORIZON_WEEKS = 53;

// ISO weekday (1 = Monday ... 7 = Sunday) of a calendar date.
function isoWeekdayOf(date: string): number {
  return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

type Instance = { index: number; unitId: string; date: string; start: number; end: number };

// PRD F04: a professional may work in several units, but intervals cannot overlap across units.
// With daylight saving time the offset of a unit changes during the year, so the intervals are
// compared as real instants on every date of the first 53 weeks from `from`, not with one offset
// (ADR-030). `unitZones` maps each unit to its IANA time zone. The later interval in the list is
// reported, with the first date on which the two overlap.
export function findCrossUnitConflict(
  intervals: WorkingInterval[],
  unitZones: Map<string, string>,
  from: string,
  horizonWeeks: number = CROSS_UNIT_HORIZON_WEEKS,
): CrossUnitConflict | null {
  const instances: Instance[] = [];
  // One day of margin on each side: a local day in one zone can start on the previous or next day in another.
  for (let offset = -1; offset <= horizonWeeks * 7; offset++) {
    const date = addCalendarDays(from, offset);
    const weekday = isoWeekdayOf(date);
    intervals.forEach((interval, index) => {
      const zone = unitZones.get(interval.unitId);
      if (!zone || interval.weekday !== weekday) return;
      instances.push({
        index,
        unitId: interval.unitId,
        date,
        start: localMinuteToUtc(date, interval.start, zone).getTime(),
        end: localMinuteToUtc(date, interval.end, zone).getTime(),
      });
    });
  }
  instances.sort((a, b) => a.start - b.start || a.end - b.end);

  // Sweep in start order: instances still running when the next one starts overlap it.
  let active: Instance[] = [];
  for (const current of instances) {
    active = active.filter((other) => other.end > current.start);
    const other = active.find((candidate) => candidate.unitId !== current.unitId);
    if (other) {
      return {
        index: Math.max(current.index, other.index),
        conflictWith: Math.min(current.index, other.index),
        date: current.date,
      };
    }
    active.push(current);
  }
  return null;
}

export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// "08:00–12:00"
export function formatInterval(interval: { start: number; end: number }): string {
  return `${formatMinutes(interval.start)}–${formatMinutes(interval.end)}`;
}
