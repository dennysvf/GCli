import { interpolate } from "@/shared/kernel/action-result";
import { formatInterval, type BusinessDay } from "./working-hours";

// pt-BR texts of the working-hour rules (PRD F04 Error Handling). They live next to the rules
// because the grid shows the same text before saving that the server returns after.
export const CROSS_UNIT_CONFLICT_TEMPLATE =
  "Conflito de horário: este profissional já atende na unidade {unit} às {weekdays}, {interval}.";
export const OUTSIDE_BUSINESS_HOURS_TEMPLATE =
  "O horário informado está fora do funcionamento da unidade ({hours}).";

export const WEEKDAY_PLURAL: Record<number, string> = {
  1: "segundas",
  2: "terças",
  3: "quartas",
  4: "quintas",
  5: "sextas",
  6: "sábados",
  7: "domingos",
};

// "Unidade Centro" reads as "unidade Centro" inside the PRD sentence.
export function unitShortName(name: string): string {
  return name.replace(/^unidade\s+/i, "");
}

// "08:00–12:00, 13:00–18:00", or "fechada às segundas" on a closed day.
export function formatBusinessDay(day: BusinessDay | undefined, weekday: number): string {
  if (!day?.open || day.intervals.length === 0) return `fechada às ${WEEKDAY_PLURAL[weekday] ?? ""}`;
  return day.intervals.map(formatInterval).join(", ");
}

export function crossUnitConflictParams(
  unitName: string,
  interval: { weekday: number; start: number; end: number },
): { unit: string; weekdays: string; interval: string } {
  return {
    unit: unitShortName(unitName),
    weekdays: WEEKDAY_PLURAL[interval.weekday] ?? "",
    interval: formatInterval(interval),
  };
}

export function crossUnitConflictMessage(
  unitName: string,
  interval: { weekday: number; start: number; end: number },
): string {
  return interpolate(CROSS_UNIT_CONFLICT_TEMPLATE, crossUnitConflictParams(unitName, interval));
}

export function outsideBusinessHoursMessage(day: BusinessDay | undefined, weekday: number): string {
  return interpolate(OUTSIDE_BUSINESS_HOURS_TEMPLATE, { hours: formatBusinessDay(day, weekday) });
}
