import { addDays, addMonths, daysBetween, isoWeekday, weekStart } from "@/shared/kernel/calendar-date";
import { fail, ok, type Result } from "@/shared/kernel/result";
import {
  SERIES_MAX_MONTHS,
  SERIES_MAX_OCCURRENCES,
  SERIES_MAX_WEEKDAYS,
  SERIES_MIN_OCCURRENCES,
  SERIES_MIN_WEEKDAYS,
} from "./limits";

// Recurring series (PRD F06 Capabilities): weekly or every 2 weeks, on 1–6 weekdays, ending after
// N occurrences (max 52) or on a date (max 12 months ahead). Dates are local to the unit.

export const SERIES_FREQUENCIES = ["WEEKLY", "BIWEEKLY"] as const;
export type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number];

export type SeriesRule = {
  frequency: SeriesFrequency;
  // ISO weekdays, 1 = Monday … 7 = Sunday.
  weekdays: number[];
  firstDate: string;
  endsAfter: number | null;
  endsOn: string | null;
};

export type Occurrence = { index: number; date: string };

export function validateSeriesRule(rule: SeriesRule): Record<string, string> | null {
  const problems: Record<string, string> = {};
  const unique = new Set(rule.weekdays);
  if (
    unique.size !== rule.weekdays.length ||
    unique.size < SERIES_MIN_WEEKDAYS ||
    unique.size > SERIES_MAX_WEEKDAYS ||
    rule.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)
  ) {
    problems["recurrence.weekdays"] = "Escolha de 1 a 6 dias da semana.";
  }
  if ((rule.endsAfter === null) === (rule.endsOn === null)) {
    problems["recurrence.endsAfter"] = "Informe o número de sessões ou a data final.";
  }
  if (
    rule.endsAfter !== null &&
    (!Number.isInteger(rule.endsAfter) ||
      rule.endsAfter < SERIES_MIN_OCCURRENCES ||
      rule.endsAfter > SERIES_MAX_OCCURRENCES)
  ) {
    problems["recurrence.endsAfter"] = "Use de 2 a 52 sessões.";
  }
  if (rule.endsOn !== null) {
    if (rule.endsOn < rule.firstDate) {
      problems["recurrence.endsOn"] = "A data final deve ser depois da primeira sessão.";
    } else if (rule.endsOn > addMonths(rule.firstDate, SERIES_MAX_MONTHS)) {
      problems["recurrence.endsOn"] = "A data final deve estar em até 12 meses.";
    }
  }
  return Object.keys(problems).length > 0 ? problems : null;
}

// Occurrence dates from the first date on, in order. "Every 2 weeks" counts from the week (Monday
// to Sunday) of the first date.
export function expandSeries(rule: SeriesRule): Result<Occurrence[], Record<string, string>> {
  const problems = validateSeriesRule(rule);
  if (problems) return fail(problems);
  const step = rule.frequency === "WEEKLY" ? 1 : 2;
  const firstWeek = weekStart(rule.firstDate);
  const weekdays = new Set(rule.weekdays);
  const lastDate = rule.endsOn ?? addMonths(rule.firstDate, SERIES_MAX_MONTHS);
  const limit = rule.endsAfter ?? SERIES_MAX_OCCURRENCES + 1;
  const occurrences: Occurrence[] = [];
  for (let date = rule.firstDate; date <= lastDate && occurrences.length < limit; date = addDays(date, 1)) {
    const week = Math.floor(daysBetween(firstWeek, date) / 7);
    if (week % step === 0 && weekdays.has(isoWeekday(date))) {
      occurrences.push({ index: occurrences.length + 1, date });
    }
  }
  if (occurrences.length > SERIES_MAX_OCCURRENCES) {
    return fail({ "recurrence.endsOn": "Use no máximo 52 sessões." });
  }
  if (occurrences.length < SERIES_MIN_OCCURRENCES) {
    return fail({ "recurrence.weekdays": "A série precisa de pelo menos 2 sessões." });
  }
  return ok(occurrences);
}
