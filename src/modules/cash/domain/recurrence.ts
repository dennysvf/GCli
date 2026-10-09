import { addMonths } from "@/shared/kernel/calendar-date";
import { RECURRENCE_OCCURRENCES } from "./limits";

// The due date of occurrence `index` (0 is the first). It is computed from the first date, never
// chained, so a short month does not pull the following ones back: Jan 31, Feb 28, Mar 31.
export function occurrenceDueDate(firstDueDate: string, index: number): string {
  return addMonths(firstDueDate, index);
}

// PRD F11: a monthly series keeps the next 12 occurrences. Returns the indexes to create, given the
// first due date, the indexes that already exist and today (occurrences due today count as future).
export function occurrencesToAdd(input: {
  firstDueDate: string;
  existingIndexes: readonly number[];
  today: string;
}): { index: number; dueDate: string }[] {
  const existing = new Set(input.existingIndexes);
  const alreadyAhead = input.existingIndexes.filter(
    (index) => occurrenceDueDate(input.firstDueDate, index) >= input.today,
  ).length;
  const missing = Math.max(0, RECURRENCE_OCCURRENCES - alreadyAhead);
  const added: { index: number; dueDate: string }[] = [];
  const last = input.existingIndexes.length > 0 ? Math.max(...input.existingIndexes) : -1;
  for (let index = last + 1; added.length < missing; index++) {
    if (existing.has(index)) continue;
    added.push({ index, dueDate: occurrenceDueDate(input.firstDueDate, index) });
  }
  return added;
}
