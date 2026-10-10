import { domainError } from "@/shared/kernel/errors";

// Dashboard error codes (spec F12 section 5). Messages live in the module catalogs.
export const AnalyticsErrors = {
  periodTooLong: () =>
    domainError("ANALYTICS_PERIOD_TOO_LONG", 400, { to: "analytics.errors.ANALYTICS_PERIOD_TOO_LONG" }),
  periodInvalid: () =>
    domainError("ANALYTICS_PERIOD_INVALID", 400, { to: "analytics.errors.ANALYTICS_PERIOD_INVALID" }),
  unitInvalid: () => domainError("ANALYTICS_UNIT_INVALID", 400),
  professionalInvalid: () => domainError("ANALYTICS_PROFESSIONAL_INVALID", 400),
} as const;
