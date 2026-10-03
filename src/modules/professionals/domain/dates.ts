// Calendar dates as "YYYY-MM-DD" strings: they sort and compare lexicographically, and carry no
// time zone, which is how validity periods are defined (spec F04 section 3). The generic helpers
// live in the shared kernel since F06.
import { addDays, isoWeekday } from "@/shared/kernel/calendar-date";

export { addDays, daysBetween, formatDateBR, isoWeekday, isValidDate } from "@/shared/kernel/calendar-date";

export function nextMonday(today: string): string {
  return addDays(today, 8 - isoWeekday(today));
}
