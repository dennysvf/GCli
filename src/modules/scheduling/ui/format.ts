import { useTranslations } from "next-intl";
import { formatMinute } from "@/shared/kernel/calendar-date";
import type { StampVariant } from "@/shared/ui/components/stamp";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import type { AppointmentStatus } from "../domain/status";

// Display helpers of the agenda (design system 7.5: formats follow the language; 5.5: status stamps).

export const STATUS_STAMPS: Record<AppointmentStatus, StampVariant> = {
  SCHEDULED: "neutral",
  CONFIRMED: "success",
  CHECKED_IN: "info",
  IN_PROGRESS: "info",
  COMPLETED: "strong",
  NO_SHOW: "danger",
  CANCELLED: "cancelled",
};

export function localParts(iso: string, timeZone: string) {
  return utcToZonedParts(new Date(iso), timeZone);
}

// Dates, times and status texts of the agenda in the language of the user; times of an instant
// are written in the unit's zone.
export function useAgendaFormat() {
  const t = useTranslations();
  const format = useFormatters();
  const timeOf = (iso: string, timeZone: string) => format.minute(localParts(iso, timeZone).minute);
  return {
    statusLabel: (status: AppointmentStatus) => t(`scheduling.ui.status.${status}`),
    statusText: (status: AppointmentStatus) => t(`scheduling.ui.status.${status}`).toUpperCase(),
    weekdayShort: (date: string) => format.weekdayOf(date, "short"),
    longDate: format.longDate,
    shortDate: format.shortDate,
    minute: format.minute,
    timeOf,
    timeRange: (startsAt: string, endsAt: string, timeZone: string) =>
      `${timeOf(startsAt, timeZone)}–${timeOf(endsAt, timeZone)}`,
    dateTimeOf: (iso: string, timeZone: string) => format.dateTime(iso, timeZone),
  };
}

export function slotTimes(granularity: number, from = 0, to = 1440): string[] {
  const times: string[] = [];
  for (let minute = Math.ceil(from / granularity) * granularity; minute < to; minute += granularity) {
    times.push(formatMinute(minute));
  }
  return times;
}
