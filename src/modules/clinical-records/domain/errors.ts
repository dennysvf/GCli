import { domainError, type DomainError } from "@/shared/kernel/errors";

// Stable error codes of the clinical-records module (spec F07 section 5). The texts live in the
// module catalogs under `clinicalRecords.errors.<CODE>`; params fill their placeholders.
export const ClinicalErrors = {
  noteNotFound: () => domainError("CLINICAL_NOTE_NOT_FOUND", 404),
  appointmentStatusInvalid: () => domainError("CLINICAL_APPOINTMENT_STATUS_INVALID", 409),
  notAppointmentProfessional: () => domainError("CLINICAL_NOT_APPOINTMENT_PROFESSIONAL", 403),
  standaloneNotAllowed: () => domainError("CLINICAL_STANDALONE_NOT_ALLOWED", 409),
  notAuthor: () => domainError("CLINICAL_NOT_AUTHOR", 403),
  noteTooLong: () => domainError("CLINICAL_NOTE_TOO_LONG", 400),
  noteEmpty: () => domainError("CLINICAL_NOTE_EMPTY", 400),
  // date and time are filled by the use case, formatted in the requester's language.
  noteLocked: (date = "", time = ""): DomainError =>
    domainError("CLINICAL_NOTE_LOCKED", 409, undefined, { date, time }),
  noteStale: () => domainError("CLINICAL_NOTE_STALE", 409),
  noteNotFinalized: () => domainError("CLINICAL_NOTE_NOT_FINALIZED", 409),
  noteAlreadyFinalized: () => domainError("CLINICAL_NOTE_ALREADY_FINALIZED", 409),
  noEditInProgress: () => domainError("CLINICAL_NO_EDIT_IN_PROGRESS", 409),
  addendumBeforeLock: () => domainError("CLINICAL_ADDENDUM_BEFORE_LOCK", 409),
  addendumTooLong: () => domainError("CLINICAL_ADDENDUM_TOO_LONG", 400),
  addendumEmpty: () => domainError("CLINICAL_ADDENDUM_EMPTY", 400),
  attachmentUnsupported: () => domainError("CLINICAL_ATTACHMENT_UNSUPPORTED", 400),
  attachmentLimit: () => domainError("CLINICAL_ATTACHMENT_LIMIT", 409),
  attachmentsClosed: () => domainError("CLINICAL_ATTACHMENTS_CLOSED", 409),
  attachmentNotFound: () => domainError("CLINICAL_ATTACHMENT_NOT_FOUND", 404),
  uploadNotFound: () => domainError("CLINICAL_UPLOAD_NOT_FOUND", 404),
  errorWindowExpired: () => domainError("CLINICAL_ATTACHMENT_ERROR_WINDOW_EXPIRED", 409),
  alertTooLong: () => domainError("CLINICAL_ALERT_TOO_LONG", 400),
  validation: (fields: Record<string, string>) => domainError("VALIDATION_FAILED", 400, fields),
} as const;
