import { CommonErrors, domainError } from "@/shared/kernel/errors";

// Patients error codes (spec F05 section 5). Texts live in the catalog under patients.errors.
export const PatientsErrors = {
  notFound: () => domainError("PATIENTS_NOT_FOUND", 404),
  // PRD F05: the message names the existing record and the form links to it. The type is the
  // abbreviation of the document ("CPF", "DNI"), the same in every language.
  documentTaken: (type: string, abbreviatedName: string, existingPatientId: string) =>
    domainError(
      "PATIENTS_DOCUMENT_TAKEN",
      409,
      { "document.number": "patients.errors.PATIENTS_DOCUMENT_TAKEN", existingPatientId },
      { type, name: abbreviatedName },
    ),
  guardianRequired: () =>
    domainError("PATIENTS_GUARDIAN_REQUIRED", 400, {
      "guardian.name": "patients.errors.PATIENTS_GUARDIAN_REQUIRED",
    }),
  staleVersion: (author: string, time: string) =>
    domainError("PATIENTS_STALE_VERSION", 409, undefined, { author, time }),
  hasFutureAppointments: (count: number) =>
    domainError("PATIENTS_HAS_FUTURE_APPOINTMENTS", 409, undefined, { count }),
  inactive: () => domainError("PATIENTS_INACTIVE", 409),
  searchTooShort: () => domainError("PATIENTS_SEARCH_TOO_SHORT", 400),
  tagLimit: () => domainError("PATIENTS_TAG_LIMIT", 400, { tagIds: "patients.errors.PATIENTS_TAG_LIMIT" }),
  invalidOption: (field: "referralSourceId" | "tagIds") =>
    domainError("PATIENTS_INVALID_OPTION", 400, { [field]: "patients.errors.PATIENTS_INVALID_OPTION" }),
  listNameTaken: () =>
    domainError("PATIENTS_LIST_NAME_TAKEN", 409, { name: "patients.errors.PATIENTS_LIST_NAME_TAKEN" }),
  listLimit: (max: number) => domainError("PATIENTS_LIST_LIMIT", 422, undefined, { max }),
  noTerms: () => domainError("PATIENTS_NO_TERMS", 409),
  invalidFile: () => domainError("PATIENTS_INVALID_FILE", 400),
  uploadNotFound: () => domainError("PATIENTS_UPLOAD_NOT_FOUND", 404),
  validation: (fields: Record<string, string>) => CommonErrors.validationFailed(fields),
} as const;
