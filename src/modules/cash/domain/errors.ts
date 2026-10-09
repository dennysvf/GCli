import { domainError } from "@/shared/kernel/errors";

// Cash register and finance error codes (spec F11 section 5). Messages live in the module catalogs;
// amounts are formatted by the application layer before the boundary.
export const CashErrors = {
  differenceNeedsJustification: (amount: string) =>
    domainError(
      "CASH_DIFFERENCE_NEEDS_JUSTIFICATION",
      400,
      { justification: "cash.errors.CASH_DIFFERENCE_NEEDS_JUSTIFICATION" },
      { amount },
    ),
  registerClosed: () => domainError("CASH_REGISTER_CLOSED", 409),
  registerNotOpen: () => domainError("CASH_REGISTER_NOT_OPEN", 409),
  registerAlreadyOpen: () => domainError("CASH_REGISTER_ALREADY_OPEN", 409),
  registerNotFound: () => domainError("CASH_REGISTER_NOT_FOUND", 404),
  dateNotAllowed: () => domainError("CASH_DATE_NOT_ALLOWED", 400),
  futureDate: () => domainError("CASH_FUTURE_DATE", 400),
  openingReasonRequired: () =>
    domainError("CASH_OPENING_REASON_REQUIRED", 400, {
      openingReason: "cash.errors.CASH_OPENING_REASON_REQUIRED",
    }),
  reasonRequired: () =>
    domainError("CASH_REASON_REQUIRED", 400, { reason: "cash.errors.CASH_REASON_REQUIRED" }),
  movementNotFound: () => domainError("CASH_MOVEMENT_NOT_FOUND", 404),
  movementAlreadyReversed: () => domainError("CASH_MOVEMENT_ALREADY_REVERSED", 409),
  categoryNotAllowed: (kind: string) => domainError("CASH_CATEGORY_NOT_ALLOWED", 400, undefined, { kind }),
  unitInvalid: () => domainError("CASH_UNIT_INVALID", 400),
  stale: () => domainError("CASH_STALE", 409),
  entryPaid: () => domainError("FINANCE_ENTRY_PAID", 409),
  entryNotPaid: () => domainError("FINANCE_ENTRY_NOT_PAID", 409),
  entryNotFound: () => domainError("FINANCE_ENTRY_NOT_FOUND", 404),
  currencyNotAvailable: (currency: string) =>
    domainError("FINANCE_CURRENCY_NOT_AVAILABLE", 400, undefined, { currency }),
  periodTooLong: () => domainError("FINANCE_PERIOD_TOO_LONG", 400),
  currencyRequired: () => domainError("FINANCE_CURRENCY_REQUIRED", 400),
  categoryNameTaken: () =>
    domainError("FINANCE_CATEGORY_NAME_TAKEN", 409, { name: "cash.errors.FINANCE_CATEGORY_NAME_TAKEN" }),
  categorySystem: () => domainError("FINANCE_CATEGORY_SYSTEM", 409),
  categoryNotFound: () => domainError("FINANCE_CATEGORY_NOT_FOUND", 404),
  attachmentInvalid: () => domainError("FINANCE_ATTACHMENT_INVALID", 400),
  seriesEnded: () => domainError("FINANCE_SERIES_ENDED", 409),
  seriesNotFound: () => domainError("FINANCE_SERIES_NOT_FOUND", 404),
  methodInvalid: () => domainError("FINANCE_METHOD_INVALID", 400),
} as const;
