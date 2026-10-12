import { domainError } from "@/shared/kernel/errors";

// Dashboard error codes (spec F12 section 5). Messages live in the module catalogs.
export const AnalyticsErrors = {
  periodTooLong: () =>
    domainError("ANALYTICS_PERIOD_TOO_LONG", 400, { to: "analytics.errors.ANALYTICS_PERIOD_TOO_LONG" }),
  periodInvalid: () =>
    domainError("ANALYTICS_PERIOD_INVALID", 400, { to: "analytics.errors.ANALYTICS_PERIOD_INVALID" }),
  unitInvalid: () => domainError("ANALYTICS_UNIT_INVALID", 400),
  professionalInvalid: () => domainError("ANALYTICS_PROFESSIONAL_INVALID", 400),
  serviceInvalid: () => domainError("ANALYTICS_SERVICE_INVALID", 400),
  reasonInvalid: () => domainError("ANALYTICS_REASON_INVALID", 400),
  reportNotFound: () => domainError("ANALYTICS_REPORT_NOT_FOUND", 404),
  // PRD F13: above the limit the user narrows the filters (CSV) or switches to CSV (PDF).
  exportTooLarge: (count: number) => domainError("ANALYTICS_EXPORT_TOO_LARGE", 422, undefined, { count }),
  pdfTooLarge: (count: number) => domainError("ANALYTICS_PDF_TOO_LARGE", 422, undefined, { count }),
} as const;
