// CSV output that opens correctly in Excel in the user's language (PRD F16, used by F13): UTF-8
// with a BOM; pt-BR and es use a semicolon separator and a decimal comma, en uses a comma
// separator and a decimal point. Money is written as a plain number with its own currency column.
import { minorUnits, type Currency } from "@/shared/kernel/countries/codes";
import type { Locale } from "./locales";

// Written without the literal character so the source stays readable.
const BOM = String.fromCharCode(0xfeff);

export function csvSeparator(locale: Locale): string {
  return locale === "en" ? "," : ";";
}

function decimalSeparator(locale: Locale): string {
  return locale === "en" ? "." : ",";
}

// No digit grouping, so spreadsheets read the value as a number: 1234,56 or 1234.56.
export function csvAmount(amountMinor: number | bigint, currency: Currency, locale: Locale): string {
  const digits = minorUnits(currency);
  const negative = amountMinor < 0;
  const absolute = (negative ? -BigInt(amountMinor) : BigInt(amountMinor))
    .toString()
    .padStart(digits + 1, "0");
  const whole = absolute.slice(0, absolute.length - digits);
  const fraction = digits > 0 ? `${decimalSeparator(locale)}${absolute.slice(-digits)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

export type CsvCell = string | number | null | undefined;

function escapeCell(value: CsvCell, separator: string): string {
  const text = value === null || value === undefined ? "" : String(value);
  // A leading formula character would run as a formula when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text.replace(",", "."))) ? `'${text}` : text;
  return /["\r\n]/.test(safe) || safe.includes(separator) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(header: string[], rows: CsvCell[][], locale: Locale): string {
  const separator = csvSeparator(locale);
  const lines = [header, ...rows].map((row) =>
    row.map((cell) => escapeCell(cell, separator)).join(separator),
  );
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
