import { domainError } from "@/shared/kernel/errors";

// Package error codes (spec F10 section 5). Messages live in the module catalogs; dates are
// "YYYY-MM-DD" in params and are written in the user's language by the application layer.
export const PackageErrors = {
  templateInvalid: (fields: Record<string, string>) => domainError("PACKAGE_TEMPLATE_INVALID", 400, fields),
  templateNameTaken: () =>
    domainError("PACKAGE_TEMPLATE_NAME_TAKEN", 409, { name: "packages.errors.PACKAGE_TEMPLATE_NAME_TAKEN" }),
  templateNotFound: () => domainError("PACKAGE_TEMPLATE_NOT_FOUND", 404),
  serviceInvalid: () => domainError("PACKAGE_SERVICE_INVALID", 400),
  noPriceForCurrency: (currency: string) =>
    domainError("PACKAGE_NO_PRICE_FOR_CURRENCY", 409, undefined, { currency }),
  priceAboveTemplate: () => domainError("PACKAGE_PRICE_ABOVE_TEMPLATE", 400),
  saleFailed: () => domainError("PACKAGE_SALE_FAILED", 503),
  notFound: () => domainError("PACKAGE_NOT_FOUND", 404),
  balanceExhausted: (remaining: number, linked: number) =>
    domainError("PACKAGE_BALANCE_EXHAUSTED", 409, undefined, { remaining, linked }),
  expired: (date: string) => domainError("PACKAGE_EXPIRED", 409, undefined, { date }),
  expiresBefore: (date: string) => domainError("PACKAGE_EXPIRES_BEFORE", 409, undefined, { date }),
  notActive: () => domainError("PACKAGE_NOT_ACTIVE", 409),
  wrongPatientOrService: () => domainError("PACKAGE_WRONG_PATIENT_OR_SERVICE", 409),
  hasLinkedAppointments: (count: number) =>
    domainError("PACKAGE_HAS_LINKED_APPOINTMENTS", 409, undefined, { count }),
  extensionLimit: (days: number) => domainError("PACKAGE_EXTENSION_LIMIT", 409, undefined, { days }),
  reasonRequired: () =>
    domainError("PACKAGE_REASON_REQUIRED", 400, { reason: "packages.errors.PACKAGE_REASON_REQUIRED" }),
  stale: () => domainError("PACKAGE_STALE", 409),
} as const;
