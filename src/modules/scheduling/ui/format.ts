import { formatMinute } from "@/shared/kernel/calendar-date";
import type { StampVariant } from "@/shared/ui/components/stamp";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import { STATUS_LABELS, type AppointmentStatus } from "../domain/status";

// Display helpers of the agenda (design system 7.1: pt-BR formats; 5.5: status stamps).

export const STATUS_STAMPS: Record<AppointmentStatus, StampVariant> = {
  SCHEDULED: "neutral",
  CONFIRMED: "success",
  CHECKED_IN: "info",
  IN_PROGRESS: "info",
  COMPLETED: "strong",
  NO_SHOW: "danger",
  CANCELLED: "cancelled",
};

export function statusText(status: AppointmentStatus): string {
  return STATUS_LABELS[status].toUpperCase();
}

const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAYS_LONG = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

function weekdayIndex(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function weekdayShort(date: string): string {
  return WEEKDAYS_SHORT[weekdayIndex(date)] ?? "";
}

// "terça-feira, 06/10/2026"
export function longDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${WEEKDAYS_LONG[weekdayIndex(date)] ?? ""}, ${day}/${month}/${year}`;
}

// "06/10"
export function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

export function localParts(iso: string, timeZone: string) {
  return utcToZonedParts(new Date(iso), timeZone);
}

export function timeOf(iso: string, timeZone: string): string {
  return formatMinute(localParts(iso, timeZone).minute);
}

export function timeRange(startsAt: string, endsAt: string, timeZone: string): string {
  return `${timeOf(startsAt, timeZone)}–${timeOf(endsAt, timeZone)}`;
}

// "06/10/2026 14:30" in the unit's zone.
export function dateTimeOf(iso: string, timeZone: string): string {
  const parts = localParts(iso, timeZone);
  const [year, month, day] = parts.date.split("-");
  return `${day}/${month}/${year} ${formatMinute(parts.minute)}`;
}

export function slotTimes(granularity: number, from = 0, to = 1440): string[] {
  const times: string[] = [];
  for (let minute = Math.ceil(from / granularity) * granularity; minute < to; minute += granularity) {
    times.push(formatMinute(minute));
  }
  return times;
}
