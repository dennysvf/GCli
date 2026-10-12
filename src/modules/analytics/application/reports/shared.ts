import type { CountryCode } from "@/shared/kernel/countries/codes";
import { formatPhoneNumber } from "@/shared/kernel/phone";
import type { ColumnDef, Cursor, ReportContext } from "./types";

export const allToNull = (value: string): string | null => (value === "ALL" ? null : value);

export function cursorOfLast(rows: { sort_at: Date; row_id: string }[]): Cursor | null {
  const last = rows[rows.length - 1];
  return last ? { at: last.sort_at, id: last.row_id } : null;
}

// Phones are stored in E.164; they are shown the way the unit's country writes them.
export function phoneOf(rc: ReportContext, unitId: string, phone: string | null): string | null {
  if (!phone) return null;
  const country = rc.unitCountries.get(unitId);
  return formatPhoneNumber(phone, country as CountryCode | undefined);
}

export const textColumn = (key: string, nullLabelKey?: string): ColumnDef => ({
  key,
  kind: "text",
  align: "left",
  ...(nullLabelKey ? { nullLabelKey } : {}),
});
