import { domainError } from "@/shared/kernel/errors";
import { AUDIT_CSV_MAX_ROWS } from "./limits";

// Error codes of the audit log viewer (spec F15 section 5). Messages live in the module catalogs.
export const AuditErrors = {
  periodTooLong: () =>
    domainError("AUDIT_PERIOD_TOO_LONG", 400, { to: "audit.errors.AUDIT_PERIOD_TOO_LONG" }),
  periodInvalid: () => domainError("AUDIT_PERIOD_INVALID", 400, { to: "audit.errors.AUDIT_PERIOD_INVALID" }),
  entityTypeRequired: () =>
    domainError("AUDIT_ENTITY_TYPE_REQUIRED", 400, { entityId: "audit.errors.AUDIT_ENTITY_TYPE_REQUIRED" }),
  eventNotFound: () => domainError("AUDIT_EVENT_NOT_FOUND", 404),
  // PRD F15: above the limit the user narrows the period or the filters. The count is capped one row
  // past the limit, so a refused export always reads "more than 100,000".
  exportTooLarge: (count: number) =>
    domainError("AUDIT_EXPORT_TOO_LARGE", 422, undefined, { count, limit: AUDIT_CSV_MAX_ROWS }),
} as const;
