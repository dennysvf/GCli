// Calendar dates as "YYYY-MM-DD" strings: they sort and compare lexicographically, and carry no
// time zone, which is how validity periods are defined (spec F04 section 3).
export function addDays(date: string, days: number): string {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// ISO weekday: 1 = Monday … 7 = Sunday.
export function isoWeekday(date: string): number {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function nextMonday(today: string): string {
  return addDays(today, 8 - isoWeekday(today));
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);
}

// "02/11/2026" (design system 7.1: Brazilian formats).
export function formatDateBR(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
