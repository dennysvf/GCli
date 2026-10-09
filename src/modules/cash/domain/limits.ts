// Business limits of PRD F11, as named constants.

// PRD F11: one movement or entry is worth 0.01 to 9,999,999.99 (minor units, an assumption of the spec).
export const MIN_AMOUNT_MINOR = 1;
export const MAX_AMOUNT_MINOR = 999_999_999;

export const DESCRIPTION_MIN_LENGTH = 3;
export const DESCRIPTION_MAX_LENGTH = 200;
export const CATEGORY_NAME_MAX_LENGTH = 60;

// PRD F11: a difference, a reversal, a reopening and a changed opening balance need a reason of at
// least 10 characters.
export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

// PRD F11: the statement covers at most 366 days.
export const MAX_STATEMENT_DAYS = 366;
// A manager can open a past register up to this many days back (spec F11 section 3).
export const MAX_PAST_OPEN_DAYS = 366;

// PRD F11: a monthly recurring expense keeps the next 12 occurrences.
export const RECURRENCE_OCCURRENCES = 12;

// PRD F11: receipts and attachments are PDF, JPG or PNG up to 10 MB.
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const ATTACHMENT_NAME_MAX_LENGTH = 200;

// PRD F11: registers not closed by 23:59 are flagged; the job acts after 00:05 local time.
export const UNCLOSED_FLAG_AFTER_MINUTE = 5;

// The payment method whose receipts and refunds move the physical cash (PRD F11).
export const CASH_METHOD = "CASH";
