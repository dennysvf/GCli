// Weekly business hours (PRD F02): per weekday, closed or up to 2 intervals, 5-minute granularity.
// Minutes are counted from midnight in the unit's time zone; an interval may end at 24:00 (1440).
// Weekdays use ISO numbering: 1 = Monday … 7 = Sunday.
export type Interval = { start: number; end: number };
export type DaySchedule = { weekday: number; open: boolean; intervals: Interval[] };
export type Week = DaySchedule[];

export const MAX_INTERVALS_PER_DAY = 2;
export const MINUTE_GRANULARITY = 5;
export const DAY_MINUTES = 1440;
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

// Returns field errors keyed as `days.<index>` (the form's field paths), or null when valid. Values
// are catalog keys (units.validation.hours.*): the form shows them next to the weekday row.
export function validateWeek(week: Week): Record<string, string> | null {
  const problems: Record<string, string> = {};
  const seen = new Set<number>();

  week.forEach((day, index) => {
    const key = `days.${index}`;
    if (!WEEKDAYS.includes(day.weekday as (typeof WEEKDAYS)[number]) || seen.has(day.weekday)) {
      problems[key] = "units.validation.hours.weekdayInvalid";
      return;
    }
    seen.add(day.weekday);
    const problem = validateDay(day);
    if (problem) problems[key] = problem;
  });

  if (seen.size !== WEEKDAYS.length && Object.keys(problems).length === 0) {
    problems.days = "units.validation.hours.sevenDays";
  }
  return Object.keys(problems).length > 0 ? problems : null;
}

function validateDay(day: DaySchedule): string | null {
  if (!day.open) return day.intervals.length === 0 ? null : "units.validation.hours.closedWithIntervals";
  if (day.intervals.length === 0) return "units.validation.hours.needsInterval";
  if (day.intervals.length > MAX_INTERVALS_PER_DAY) return "units.validation.hours.maxIntervals";

  for (const interval of day.intervals) {
    if (interval.start < 0 || interval.end > DAY_MINUTES) return "units.validation.hours.outsideDay";
    if (interval.start % MINUTE_GRANULARITY !== 0 || interval.end % MINUTE_GRANULARITY !== 0) {
      return "units.validation.hours.granularity";
    }
    if (interval.start >= interval.end) return "units.validation.hours.startBeforeEnd";
  }
  const [first, second] = day.intervals;
  if (first && second && second.start <= first.end) {
    return "units.validation.hours.secondAfterFirst";
  }
  return null;
}

// True when [start, end) on the weekday lies entirely inside one open interval. Used by F04
// (working hours within business hours) and F06 (bookings within business hours).
export function isWithinHours(week: Week, weekday: number, start: number, end: number): boolean {
  const day = week.find((item) => item.weekday === weekday);
  if (!day?.open) return false;
  return day.intervals.some((interval) => interval.start <= start && end <= interval.end);
}

// Sorts days Monday-first and intervals by start, so stored and compared weeks are stable.
export function normalizeWeek(week: Week): Week {
  return [...week]
    .sort((a, b) => a.weekday - b.weekday)
    .map((day) => ({
      weekday: day.weekday,
      open: day.open,
      intervals: day.open ? [...day.intervals].sort((a, b) => a.start - b.start) : [],
    }));
}

export function closedWeek(): Week {
  return WEEKDAYS.map((weekday) => ({ weekday, open: false, intervals: [] }));
}

export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
