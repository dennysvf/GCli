// Weekday names and calendar-date texts in a language (design system 7.5). Names come from Intl,
// so no catalog holds them; the formatting locale is the one from formatLocale().
import { formatLocale } from "./format";
import type { Locale } from "./locales";

export type NameStyle = "long" | "short" | "narrow";

// 2024-01-01 is a Monday, so ISO weekday N (1 = Monday ... 7 = Sunday) is day N of January 2024.
export function weekdayName(locale: Locale, isoWeekday: number, style: NameStyle = "long"): string {
  const date = new Date(Date.UTC(2024, 0, isoWeekday));
  const name = new Intl.DateTimeFormat(formatLocale(locale, null), {
    weekday: style,
    timeZone: "UTC",
  }).format(date);
  // Short Portuguese and Spanish names end with a period in some engines ("seg."); the grid is tighter without it.
  return name.replace(/\.$/, "");
}

function calendarInstant(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

// "terça-feira, 06/10/2026" in pt-BR, "Tuesday, 10/06/2026" in en.
export function formatLongDate(date: string, locale: Locale): string {
  const isoWeekday = ((calendarInstant(date).getUTCDay() + 6) % 7) + 1;
  const numeric = new Intl.DateTimeFormat(formatLocale(locale, null), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(calendarInstant(date));
  return `${weekdayName(locale, isoWeekday, "long")}, ${numeric}`;
}

// Day and month only: "06/10" in pt-BR, "10/06" in en.
export function formatShortDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(formatLocale(locale, null), {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(calendarInstant(date));
}

export function weekdayNameOf(date: string, locale: Locale, style: NameStyle = "short"): string {
  const isoWeekday = ((calendarInstant(date).getUTCDay() + 6) % 7) + 1;
  return weekdayName(locale, isoWeekday, style);
}
