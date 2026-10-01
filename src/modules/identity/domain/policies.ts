// Identity business rules from PRD F01, as named constants and pure functions.

// PRD F01: password minimum 10 characters with at least one letter and one digit.
// The 128-character cap prevents hashing-cost denial of service (spec section 3).
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordProblem = "too_short" | "too_long" | "missing_letter" | "missing_digit";

export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "too_long";
  if (!/\p{L}/u.test(password)) return "missing_letter";
  if (!/\d/.test(password)) return "missing_digit";
  return null;
}

// PRD F01: 5 consecutive failed sign-ins lock the account for 15 minutes.
export const MAX_FAILED_SIGN_INS = 5;
export const LOCK_MINUTES = 15;

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return !!lockedUntil && lockedUntil > now;
}

// PRD F01: sessions expire after 60 minutes of inactivity and 12 hours absolute.
export const SESSION_IDLE_MINUTES = 60;
export const SESSION_ABSOLUTE_HOURS = 12;
// lastActiveAt is written at most once per minute.
export const SESSION_TOUCH_SECONDS = 60;

export type SessionState = "active" | "idle_expired" | "absolute_expired";

export function sessionState(session: { createdAt: Date; lastActiveAt: Date }, now: Date): SessionState {
  if (now.getTime() - session.createdAt.getTime() >= SESSION_ABSOLUTE_HOURS * 3_600_000) {
    return "absolute_expired";
  }
  if (now.getTime() - session.lastActiveAt.getTime() >= SESSION_IDLE_MINUTES * 60_000) return "idle_expired";
  return "active";
}

export function shouldTouchSession(lastActiveAt: Date, now: Date): boolean {
  return now.getTime() - lastActiveAt.getTime() >= SESSION_TOUCH_SECONDS * 1000;
}

// PRD F01: invitation links are valid for 72 hours; password reset links for 60 minutes.
export const INVITATION_TTL_HOURS = 72;
export const PASSWORD_RESET_TTL_MINUTES = 60;

// PRD F01: up to 100 active users per organization (pending invitations count, spec assumptions).
export const MAX_USERS = 100;

// PRD F01: Administrator or Manager users may be linked to a professional profile (F04), as may
// Professional users. Other roles never gain linked-professional permissions.
export const LINKABLE_ROLES = ["PROFESSIONAL", "ADMINISTRATOR", "MANAGER"] as const;

export function isLinkableRole(role: string): boolean {
  return (LINKABLE_ROLES as readonly string[]).includes(role);
}

// PRD F01: agenda slot granularity options and organization time zones (Brazilian IANA zones).
export const SLOT_GRANULARITIES = [5, 10, 15, 30] as const;
export { BRAZIL_TIME_ZONES } from "@/shared/kernel/time-zones";

// PRD F01: logo PNG/JPG/SVG up to 2 MB; stored as PNG at most 400×160 (2× the 200×80 display).
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_WIDTH = 400;
export const LOGO_MAX_HEIGHT = 160;
