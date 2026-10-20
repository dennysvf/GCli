import { domainError } from "@/shared/kernel/errors";

// Error codes of the privacy module (spec F14 section 5). Messages live in the module catalogs.
export const PrivacyErrors = {
  periodInvalid: () => domainError("PRIVACY_PERIOD_INVALID", 400, { to: "privacy.validation.periodInvalid" }),
  cursorInvalid: () => domainError("PRIVACY_CURSOR_INVALID", 400),
  patientNotFound: () => domainError("PRIVACY_PATIENT_NOT_FOUND", 404),
  noteNotFound: () => domainError("PRIVACY_NOTE_NOT_FOUND", 404),
  requestNotFound: () => domainError("PRIVACY_REQUEST_NOT_FOUND", 404),
  requestClosed: () => domainError("PRIVACY_REQUEST_CLOSED", 409),
  typeMismatch: () => domainError("PRIVACY_REQUEST_TYPE_MISMATCH", 409),
  anonymizationRequestOpen: () => domainError("PRIVACY_ANONYMIZATION_REQUEST_OPEN", 409),
  patientAnonymized: () => domainError("PRIVACY_PATIENT_ANONYMIZED", 409),
  exportInProgress: () => domainError("PRIVACY_EXPORT_IN_PROGRESS", 409),
  exportNotReady: () => domainError("PRIVACY_EXPORT_NOT_READY", 409),
  // The date is formatted by the application layer in the requester's language.
  exportExpired: (date: string) => domainError("PRIVACY_EXPORT_EXPIRED", 410, undefined, { date }),
  exportNotFound: () => domainError("PRIVACY_EXPORT_NOT_FOUND", 404),
  anonymizationBlocked: () => domainError("PRIVACY_ANONYMIZATION_BLOCKED", 409),
  nameMismatch: () =>
    domainError("PRIVACY_NAME_MISMATCH", 422, { typedName: "privacy.errors.PRIVACY_NAME_MISMATCH" }),
} as const;
