// Business limits of PRD F09, as named constants.

// PRD F09: a discount above 10% needs a reason; above 20% a Manager or Administrator approves it.
export const DISCOUNT_REASON_ABOVE_PERCENT = 10;
export const DISCOUNT_APPROVAL_ABOVE_PERCENT = 20;
// A percentage is typed with two decimals and kept in basis points (1500 = 15%).
export const BASIS_POINTS = 10_000;

// PRD F09: credit card installments, for information only.
export const MIN_INSTALLMENTS = 1;
export const MAX_INSTALLMENTS = 12;

// PRD F09: Managers and Administrators may date a payment up to 7 days back.
export const BACKDATE_DAYS = 7;

// Reasons for voids, refunds, discounts and rejections (3 to 500 characters, like the other modules).
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;
export const DESCRIPTION_MAX_LENGTH = 200;

// A receive submission carries a handful of payment lines (cash + card + transfer...).
export const MAX_PAYMENT_LINES = 6;

// PRD F09: the receipt is generated in at most 3 seconds; the render is cut off at 10.
export const RECEIPT_TARGET_MS = 3000;
export const RECEIPT_TIMEOUT_MS = 10_000;

export const PAGE_SIZE = 50;
// The charges list covers at most one year per query.
export const MAX_PERIOD_DAYS = 366;
