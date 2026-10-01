import { DAY_MINUTES, MAX_INTERVALS_PER_UNIT_DAY, MINUTE_GRANULARITY, WEEK_MINUTES } from "./limits";

// Working-hour intervals (PRD F04): per unit and ISO weekday (1 = Monday … 7 = Sunday), minutes
// from midnight in the unit's local time, 5-minute granularity, at most 4 per unit and day.
export type WorkingInterval = { unitId: string; weekday: number; start: number; end: number };

// A unit's business hours for one weekday, as F02 provides them.
export type BusinessDay = { weekday: number; open: boolean; intervals: { start: number; end: number }[] };

// Field errors keyed `intervals.<index>`, the form's field paths.
export type IntervalErrors = Record<string, string>;

export const INTERVAL_MESSAGES = {
  weekday: "Dia da semana inválido.",
  range: "Informe um horário entre 00:00 e 24:00, com início antes do término.",
  granularity: "Use horários em múltiplos de 5 minutos.",
  tooMany: `No máximo ${MAX_INTERVALS_PER_UNIT_DAY} intervalos por dia em cada unidade.`,
  overlap: "Os intervalos de um mesmo dia não podem se sobrepor.",
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

// Segments of the week in UTC minutes, split where an interval crosses the end of the week.
function weekSegments(interval: WorkingInterval, offsetMinutes: number): [number, number][] {
  const start = (interval.weekday - 1) * DAY_MINUTES + interval.start - offsetMinutes;
  const normalized = ((start % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  const end = normalized + (interval.end - interval.start);
  if (end <= WEEK_MINUTES) return [[normalized, end]];
  return [
    [normalized, WEEK_MINUTES],
    [0, end - WEEK_MINUTES],
  ];
}

function overlaps(a: [number, number][], b: [number, number][]): boolean {
  return a.some(([aStart, aEnd]) => b.some(([bStart, bEnd]) => aStart < bEnd && bStart < aEnd));
}

export type CrossUnitConflict = { index: number; conflictWith: number };

// PRD F04: a professional may work in several units, but intervals cannot overlap across units.
// Intervals are compared in real time: each unit's local minutes are shifted by its UTC offset
// (minutes east of UTC) before comparing (ADR-021). The later interval in the list is reported.
export function findCrossUnitConflict(
  intervals: WorkingInterval[],
  unitOffsets: Map<string, number>,
): CrossUnitConflict | null {
  const segments = intervals.map((interval) => weekSegments(interval, unitOffsets.get(interval.unitId) ?? 0));
  for (let j = 1; j < intervals.length; j++) {
    for (let i = 0; i < j; i++) {
      if (intervals[i]?.unitId === intervals[j]?.unitId) continue;
      if (overlaps(segments[i] ?? [], segments[j] ?? [])) return { index: j, conflictWith: i };
    }
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
