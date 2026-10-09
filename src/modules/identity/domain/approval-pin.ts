// PRD F09: Managers and Administrators approve large discounts at the front desk by typing a
// personal PIN. Its rules are kept here as named constants and pure functions.
export const APPROVAL_PIN_LENGTH = 6;
// 5 wrong PINs lock that PIN for 15 minutes, like the sign-in lock of PRD F01.
export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MINUTES = 15;

export function isPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${APPROVAL_PIN_LENGTH}}$`).test(pin);
}

// One repeated digit (111111) or a run of consecutive digits going up or down (123456, 654321).
export function isWeakPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  if (digits.every((digit) => digit === digits[0])) return true;
  const steps = digits.slice(1).map((digit, index) => digit - (digits[index] ?? 0));
  return steps.every((step) => step === 1) || steps.every((step) => step === -1);
}

export function isPinLocked(lockedUntil: Date | null, now: Date): boolean {
  return !!lockedUntil && lockedUntil > now;
}

// State after one wrong PIN. The fifth failure locks and starts a new count.
export function afterPinFailure(
  failedCount: number,
  now: Date,
): { failedCount: number; lockedUntil: Date | null } {
  const next = failedCount + 1;
  if (next >= PIN_MAX_FAILURES) {
    return { failedCount: 0, lockedUntil: new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000) };
  }
  return { failedCount: next, lockedUntil: null };
}
