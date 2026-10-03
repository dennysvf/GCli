import { formatInterval, type BusinessDay } from "./working-hours";

// Parameters of the texts of the working-hour rules (PRD F04 Error Handling). The sentences live in
// the professionals catalog (professionals.errors.*); the grid shows the same text before saving
// that the server returns after, built from the same parameters.

// "Unidade Centro" reads as "unidade Centro" inside the PRD sentence.
export function unitShortName(name: string): string {
  return name.replace(/^unidade\s+/i, "");
}

// "08:00–12:00, 13:00–18:00", or null on a closed day (the sentence then says "closed on Mondays").
export function businessDayHours(day: BusinessDay | undefined): string | null {
  if (!day?.open || day.intervals.length === 0) return null;
  return day.intervals.map(formatInterval).join(", ");
}

// Parameters of PROFESSIONALS_CROSS_UNIT_CONFLICT. The weekday is a number that the catalog turns
// into the plural name of the day in each language; `date` is the first date of the conflict.
export function crossUnitConflictParams(
  unitName: string,
  interval: { weekday: number; start: number; end: number },
  date: string,
): { unit: string; weekday: string; interval: string; date: string } {
  return {
    unit: unitShortName(unitName),
    weekday: String(interval.weekday),
    interval: formatInterval(interval),
    date,
  };
}
