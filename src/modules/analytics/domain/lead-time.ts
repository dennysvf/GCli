const HOUR_MS = 3_600_000;

// PRD F13: hours between the cancellation and the appointment start, whole hours rounded down.
// A cancellation after the start gives a negative number.
export function leadTimeHours(cancelledAt: Date, startsAt: Date): number {
  return Math.floor((startsAt.getTime() - cancelledAt.getTime()) / HOUR_MS);
}
