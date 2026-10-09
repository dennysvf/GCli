import { addDays } from "@/shared/kernel/calendar-date";
import { MAX_EXTENDED_DAYS } from "./limits";

// Validity counts calendar days: the sale day is day 1, and the package is valid through the end of
// its last day (PRD F10, spec section 3).
export function expiryDate(soldOn: string, validityDays: number, extendedDays: number): string {
  return addDays(soldOn, validityDays - 1 + extendedDays);
}

// Days that can still be added to a package that already has `extendedDays` of extension.
export function remainingExtension(extendedDays: number): number {
  return Math.max(0, MAX_EXTENDED_DAYS - extendedDays);
}
