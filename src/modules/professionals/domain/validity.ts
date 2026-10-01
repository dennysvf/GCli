import { addDays } from "./dates";

// Validity of working-hour schedules (PRD F04): a start date and an optional end date, both
// inclusive calendar dates. A professional's schedules never overlap (spec F04 section 3).
export type SchedulePeriod = { id: string; validFrom: string; validUntil: string | null };
export type ScheduleState = "ended" | "current" | "future";

export function scheduleState(schedule: SchedulePeriod, today: string): ScheduleState {
  if (schedule.validUntil !== null && schedule.validUntil < today) return "ended";
  return schedule.validFrom > today ? "future" : "current";
}

export function isScheduleEditable(schedule: SchedulePeriod, today: string): boolean {
  return scheduleState(schedule, today) !== "ended";
}

// Only schedules that have not started can be deleted, so past and current weeks never change.
export function isScheduleDeletable(schedule: SchedulePeriod, today: string): boolean {
  return scheduleState(schedule, today) === "future";
}

function covers(schedule: SchedulePeriod, date: string): boolean {
  return schedule.validFrom <= date && (schedule.validUntil === null || date <= schedule.validUntil);
}

export function scheduleOn<T extends SchedulePeriod>(schedules: T[], date: string): T | undefined {
  return schedules.find((schedule) => covers(schedule, date));
}

const OPEN_END = "9999-12-31";

function periodsOverlap(
  a: { validFrom: string; validUntil: string | null },
  b: { validFrom: string; validUntil: string | null },
): boolean {
  return a.validFrom <= (b.validUntil ?? OPEN_END) && b.validFrom <= (a.validUntil ?? OPEN_END);
}

export type SchedulePlan =
  { ok: true; close: { id: string; validUntil: string } | null } | { ok: false; conflictFrom: string };

// Saving a schedule from validFrom closes the earlier schedule that covers that date on the day
// before, so a future change takes one step. A schedule that starts on or after the new start
// date is a conflict: the user edits that schedule instead.
export function planSchedule(
  others: SchedulePeriod[],
  period: { validFrom: string; validUntil: string | null },
): SchedulePlan {
  let close: { id: string; validUntil: string } | null = null;
  for (const other of others) {
    if (!periodsOverlap(other, period)) continue;
    if (other.validFrom >= period.validFrom) return { ok: false, conflictFrom: other.validFrom };
    close = { id: other.id, validUntil: addDays(period.validFrom, -1) };
  }
  return { ok: true, close };
}

export const VALIDITY_MESSAGES = {
  startInPast: "A vigência deve começar hoje ou depois.",
  startLocked: "A data de início de um horário vigente não pode ser alterada.",
  endBeforeStart: "A data de término deve ser igual ou posterior ao início e a hoje.",
} as const;

// Field errors for a schedule's dates. `current` is the stored schedule when editing.
export function validateValidity(
  period: { validFrom: string; validUntil: string | null },
  current: SchedulePeriod | null,
  today: string,
): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (current !== null && scheduleState(current, today) === "current") {
    if (period.validFrom !== current.validFrom) errors.validFrom = VALIDITY_MESSAGES.startLocked;
  } else if (period.validFrom < today) {
    errors.validFrom = VALIDITY_MESSAGES.startInPast;
  }
  if (period.validUntil !== null && (period.validUntil < period.validFrom || period.validUntil < today)) {
    errors.validUntil = VALIDITY_MESSAGES.endBeforeStart;
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
