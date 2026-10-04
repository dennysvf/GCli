import { useTranslations } from "next-intl";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { FindingDto } from "../application/booking";

type Formatters = ReturnType<typeof useFormatters>;

// "480-720,780-1080" (minutes from midnight) as "08:00 – 12:00, 13:00 – 18:00" in the user's language.
function hoursText(encoded: string | null | undefined, format: Formatters): string {
  if (!encoded) return "";
  return encoded
    .split(",")
    .map((interval) => {
      const [start = 0, end = 0] = interval.split("-").map(Number);
      const at = (minute: number) => format.time(new Date(Date.UTC(2024, 0, 1, 0, minute)), "UTC");
      return `${at(start)}–${at(end)}`;
    })
    .join(", ");
}

// The text of a conflict finding in the language of the user (ADR-028). The server sends the code
// and raw values; times are written here, in the unit zone, with the formats of the language.
export function useFindingText(): (finding: FindingDto) => string {
  const t = useTranslations();
  const format = useFormatters();
  return (finding) => {
    const params = finding.params;
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) if (typeof value === "string") values[key] = value;

    const { timeZone, start, end, onDate } = params;
    if (timeZone && start && end && onDate) {
      // Times on the day of the booking are just the time; other days add the day and month.
      const label = (iso: string) => {
        const date = utcToZonedParts(new Date(iso), timeZone).date;
        const time = format.time(iso, timeZone);
        return date === onDate ? time : `${format.shortDate(date)} ${time}`;
      };
      values.start = label(start);
      values.end = label(end);
    }
    if (finding.code === "SCHEDULING_OUTSIDE_WORKING_HOURS") {
      values.hours = hoursText(params.hours, format) || t("scheduling.findings.noWorkingHours");
    }
    if (finding.code === "SCHEDULING_OUTSIDE_UNIT_HOURS") {
      values.hours = hoursText(params.hours, format) || t("scheduling.findings.unitClosedDay");
    }
    if (finding.code === "SCHEDULING_TIME_OFF") {
      values.type = t(`scheduling.findings.timeOffTypes.${params.type ?? "OTHER"}`);
    }
    if (finding.code === "SCHEDULING_ROOM_CONFLICT") {
      values.room = params.room ?? t("scheduling.findings.roomFallback");
    }
    return t(`scheduling.findings.${finding.code}`, values);
  };
}
