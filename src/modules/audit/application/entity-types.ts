import type { AuditAction } from "@/shared/audit/audit-writer";

// Spec F15 decision D16: every value of the AuditAction union, in the order of the filter. RETIME
// and SKIP (series conflict resolutions) are not audit actions and are never offered.
export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "READ_SENSITIVE",
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET",
  "PERMISSION_DENIED",
  "EXPORT",
] as const satisfies readonly AuditAction[];

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

// Spec F15 decision D17: every entity type recorded in src/modules, plus the export of the audit
// log itself, grouped as the entity type filter shows them. A unit test compares this registry with
// the sources, so a module cannot record a type that the viewer lacks.
export const AUDIT_ENTITY_TYPE_GROUPS = [
  {
    key: "patients",
    types: ["patient", "consent_record", "privacy_terms_version", "referral_source", "tag"],
  },
  { key: "privacy", types: ["lgpd_request", "lgpd_export"] },
  { key: "scheduling", types: ["appointment", "appointment_series", "cancellation_reason"] },
  {
    key: "clinical",
    types: [
      "clinical_note",
      "clinical_note_version",
      "clinical_note_addendum",
      "clinical_attachment",
      "clinical_alert",
    ],
  },
  {
    key: "documents",
    types: ["patient_document", "document_template", "document_category", "document_storage_usage"],
  },
  {
    key: "financial",
    types: [
      "charge",
      "payment",
      "payment_method",
      "patient_package",
      "package_template",
      "package_settings",
      "cash_register",
      "cash_movement",
      "financial_entry",
      "financial_entry_series",
      "financial_category",
      "financial_attachment",
    ],
  },
  {
    key: "setup",
    types: [
      "unit",
      "unit_closure",
      "room",
      "service",
      "service_category",
      "professional",
      "professional_schedule",
      "professional_time_off",
    ],
  },
  { key: "access", types: ["user", "invitation", "organization", "report", "audit_log"] },
] as const;

export const AUDIT_ENTITY_TYPES: readonly string[] = AUDIT_ENTITY_TYPE_GROUPS.flatMap((group) => group.types);

// The entity type of the export event of the audit log (spec F15 section 5).
export const AUDIT_LOG_ENTITY_TYPE = "audit_log";
