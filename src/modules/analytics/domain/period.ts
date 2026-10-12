import { addDays, addMonths, daysBetween } from "@/shared/kernel/calendar-date";

export const PERIOD_PRESETS = [
  "TODAY",
  "LAST_7_DAYS",
  "LAST_30_DAYS",
  "CURRENT_MONTH",
  "PREVIOUS_MONTH",
  "CUSTOM",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

// Inclusive range of calendar dates ("YYYY-MM-DD").
export type DateRange = { from: string; to: string };

function firstOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

export function periodDays(range: DateRange): number {
  return daysBetween(range.from, range.to) + 1;
}

// PRD F12 filters. `today` is the calendar date in the anchor time zone (spec F12, assumption 2).
export function resolvePeriod(preset: PeriodPreset, today: string, custom?: DateRange): DateRange {
  switch (preset) {
    case "TODAY":
      return { from: today, to: today };
    case "LAST_7_DAYS":
      return { from: addDays(today, -6), to: today };
    case "LAST_30_DAYS":
      return { from: addDays(today, -29), to: today };
    case "CURRENT_MONTH":
      return { from: firstOfMonth(today), to: today };
    case "PREVIOUS_MONTH": {
      const first = addMonths(firstOfMonth(today), -1);
      return { from: first, to: addDays(firstOfMonth(today), -1) };
    }
    case "CUSTOM":
      return custom ?? { from: today, to: today };
  }
}

// Spec F12 decision D6: the previous equivalent period has the same length and covers the same
// stretch. The current month to date compares with day 1 to the same day of the previous month,
// capped at its last day (addMonths clamps 31 to 30 or 28).
export function previousPeriod(range: DateRange, preset: PeriodPreset): DateRange {
  if (preset === "CURRENT_MONTH") {
    return { from: addMonths(range.from, -1), to: addMonths(range.to, -1) };
  }
  if (preset === "PREVIOUS_MONTH") {
    return { from: addMonths(range.from, -1), to: addDays(range.from, -1) };
  }
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(periodDays(range) - 1)), to };
}
