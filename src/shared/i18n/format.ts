// Locale-aware formatting for server and application code (PRD F16). Browser code uses the
// next-intl formatter, which follows the same locale. The domain never formats text.
import { minorUnits, type CountryCode, type Currency } from "@/shared/kernel/countries/codes";
import type { Locale } from "./locales";

export type MoneyLike = { amountMinor: number | bigint; currency: Currency };

const SPANISH_COUNTRIES: readonly CountryCode[] = ["ES", "MX", "AR", "CL", "CO"];

// The formatting locale combines the user's language with the country of the unit in context
// when the language is spoken there: es + MX is es-MX, es + US falls back to es-ES.
export function formatLocale(language: Locale, country?: CountryCode | null): string {
  if (language === "en") return "en-US";
  if (language === "es") {
    return country && SPANISH_COUNTRIES.includes(country) ? `es-${country}` : "es-ES";
  }
  return country === "PT" ? "pt-PT" : "pt-BR";
}

// Intl separates groups with no-break spaces; plain spaces keep text comparable everywhere.
function plain(text: string): string {
  return text.replace(/[  ]/g, " ");
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A "YYYY-MM-DD" string is a calendar date with no time zone; anything else is an instant.
function resolve(value: Date | string, timeZone: string | undefined): { date: Date; timeZone?: string } {
  if (typeof value === "string" && CALENDAR_DATE.test(value)) {
    return { date: new Date(`${value}T12:00:00Z`), timeZone: "UTC" };
  }
  return { date: typeof value === "string" ? new Date(value) : value, ...(timeZone ? { timeZone } : {}) };
}

export function formatDate(value: Date | string, locale: string, timeZone?: string): string {
  const resolved = resolve(value, timeZone);
  return plain(
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(resolved.timeZone ? { timeZone: resolved.timeZone } : {}),
    }).format(resolved.date),
  );
}

export function formatTime(value: Date | string, locale: string, timeZone?: string): string {
  const resolved = resolve(value, timeZone);
  return plain(
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      ...(resolved.timeZone ? { timeZone: resolved.timeZone } : {}),
    }).format(resolved.date),
  );
}

export function formatDateTime(value: Date | string, locale: string, timeZone?: string): string {
  return `${formatDate(value, locale, timeZone)} ${formatTime(value, locale, timeZone)}`;
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return plain(new Intl.NumberFormat(locale, options).format(value));
}

// Amounts are integer minor units; the currency decides how many decimals are shown.
export function formatMoney(money: MoneyLike, locale: string): string {
  const digits = minorUnits(money.currency);
  const major = Number(money.amountMinor) / 10 ** digits;
  return plain(
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major),
  );
}

// Decimal and group separators of a locale, for parsing what a user types.
export function numberSeparators(locale: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return {
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    group: plain(parts.find((part) => part.type === "group")?.value ?? ","),
  };
}
