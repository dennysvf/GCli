// Business limits of PRD F10, as named constants.

// PRD F10: a package has 2 to 100 sessions, a price of 0.01 to 99,999.99 and 30 to 730 days of validity.
export const MIN_SESSIONS = 2;
export const MAX_SESSIONS = 100;
export const MIN_PRICE_MINOR = 1;
export const MAX_PRICE_MINOR = 9_999_999;
export const MIN_VALIDITY_DAYS = 30;
export const MAX_VALIDITY_DAYS = 730;

// PRD F10: a Manager or Administrator extends the validity by up to 365 days (in total, interview).
export const MAX_EXTENDED_DAYS = 365;

export const NAME_MAX_LENGTH = 80;
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;
