import { useLocale } from "next-intl";
import {
  formatLongDate,
  formatShortDate,
  weekdayName,
  weekdayNameOf,
  type NameStyle,
} from "@/shared/i18n/calendar-names";
import {
  formatDate,
  formatDateTime,
  formatLocale,
  formatMoney,
  formatNumber,
  formatTime,
  type MoneyLike,
} from "@/shared/i18n/format";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/shared/i18n/locales";

// Formatting (server and browser components) that follows the language of the signed-in user (ADR-028). A "YYYY-MM-DD"
// string is a calendar date; anything else is an instant shown in the given time zone.
export function useFormatters() {
  const current = useLocale();
  const locale: Locale = isLocale(current) ? current : DEFAULT_LOCALE;
  const intl = formatLocale(locale, null);
  return {
    locale,
    date: (value: Date | string, timeZone?: string) => formatDate(value, intl, timeZone),
    // A time of day (minutes from midnight, 1440 = end of the day) as the language writes it.
    minute: (minute: number) => formatTime(new Date(Date.UTC(2024, 0, 1, 0, minute)), intl, "UTC"),
    time: (value: Date | string, timeZone?: string) => formatTime(value, intl, timeZone),
    dateTime: (value: Date | string, timeZone?: string) => formatDateTime(value, intl, timeZone),
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, intl, options),
    money: (value: MoneyLike) => formatMoney(value, intl),
    longDate: (date: string) => formatLongDate(date, locale),
    shortDate: (date: string) => formatShortDate(date, locale),
    weekday: (isoWeekday: number, style?: NameStyle) => weekdayName(locale, isoWeekday, style),
    weekdayOf: (date: string, style?: NameStyle) => weekdayNameOf(date, locale, style),
  };
}
