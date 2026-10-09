import { domainError } from "@/shared/kernel/errors";

// Billing error codes (spec F09 section 5). Messages live in the module catalogs. Errors that
// show amounts carry the minor units in params; the application layer turns them into text in
// the user's language before they reach the boundary.
export const BillingErrors = {
  chargeNotFound: () => domainError("BILLING_CHARGE_NOT_FOUND", 404),
  chargeStale: () => domainError("BILLING_CHARGE_STALE", 409),
  chargeCancelled: () => domainError("BILLING_CHARGE_CANCELLED", 409),
  chargeAlreadyPaid: () => domainError("BILLING_CHARGE_ALREADY_PAID", 409),
  paymentExceedsBalance: (amountMinor: number, balanceMinor: number, currency: string) =>
    domainError("BILLING_PAYMENT_EXCEEDS_BALANCE", 409, undefined, { amountMinor, balanceMinor, currency }),
  discountPendingApproval: () => domainError("BILLING_DISCOUNT_PENDING_APPROVAL", 409),
  discountNeedsApproval: () => domainError("BILLING_DISCOUNT_NEEDS_APPROVAL", 409),
  discountReasonRequired: () =>
    domainError("BILLING_DISCOUNT_REASON_REQUIRED", 400, {
      reason: "billing.errors.BILLING_DISCOUNT_REASON_REQUIRED",
    }),
  discountInvalid: () =>
    domainError("BILLING_DISCOUNT_INVALID", 400, { value: "billing.errors.BILLING_DISCOUNT_INVALID" }),
  discountLocked: () => domainError("BILLING_DISCOUNT_LOCKED", 409),
  noPendingDiscount: () => domainError("BILLING_NO_PENDING_DISCOUNT", 409),
  approverInvalid: () => domainError("BILLING_APPROVER_INVALID", 400),
  chargeHasPayments: () => domainError("BILLING_CHARGE_HAS_PAYMENTS", 409),
  checkInUndoHasPayments: () => domainError("BILLING_CHECK_IN_UNDO_HAS_PAYMENTS", 409),
  reasonRequired: () =>
    domainError("BILLING_REASON_REQUIRED", 400, { reason: "billing.errors.BILLING_REASON_REQUIRED" }),
  amountInvalid: () =>
    domainError("BILLING_AMOUNT_INVALID", 400, { amount: "billing.errors.BILLING_AMOUNT_INVALID" }),
  paymentMethodInvalid: () => domainError("BILLING_PAYMENT_METHOD_INVALID", 400),
  installmentsInvalid: () => domainError("BILLING_INSTALLMENTS_INVALID", 400),
  backdateForbidden: () => domainError("BILLING_BACKDATE_FORBIDDEN", 403),
  paymentDateInvalid: (min: string) => domainError("BILLING_PAYMENT_DATE_INVALID", 400, undefined, { min }),
  unitRequired: () => domainError("BILLING_UNIT_REQUIRED", 400),
  currencyMismatch: (currency: string, chargeCurrency: string) =>
    domainError("BILLING_CURRENCY_MISMATCH", 409, undefined, { currency, chargeCurrency }),
  paymentNotFound: () => domainError("BILLING_PAYMENT_NOT_FOUND", 404),
  refundExceeds: (amountMinor: number, availableMinor: number, currency: string) =>
    domainError("BILLING_REFUND_EXCEEDS", 409, undefined, { amountMinor, availableMinor, currency }),
  notRefundable: () => domainError("BILLING_NOT_REFUNDABLE", 409),
  cashRegisterClosed: (unit: string) => domainError("BILLING_CASH_REGISTER_CLOSED", 409, undefined, { unit }),
  serviceInvalid: () => domainError("BILLING_SERVICE_INVALID", 400),
  patientInvalid: () => domainError("BILLING_PATIENT_INVALID", 400),
  paymentMethodsEmpty: (country: string) =>
    domainError("BILLING_PAYMENT_METHODS_EMPTY", 409, undefined, { country }),
  receiptFailed: () => domainError("BILLING_RECEIPT_FAILED", 503),
} as const;
