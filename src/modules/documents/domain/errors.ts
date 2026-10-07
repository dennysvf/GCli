import { domainError, type DomainError } from "@/shared/kernel/errors";

// Stable error codes of the documents module (spec F08 section 5). The texts live in the module
// catalogs under `documents.errors.<CODE>`; params fill their placeholders.
export const DocumentsErrors = {
  fileUnsupported: (fileName = "") => domainError("DOCUMENT_FILE_UNSUPPORTED", 400, undefined, { fileName }),
  batchLimit: () => domainError("DOCUMENT_BATCH_LIMIT", 400),
  quotaExceeded: () => domainError("DOCUMENT_QUOTA_EXCEEDED", 409),
  uploadNotFound: () => domainError("DOCUMENT_UPLOAD_NOT_FOUND", 404),
  notFound: () => domainError("DOCUMENT_NOT_FOUND", 404),
  stale: () => domainError("DOCUMENT_STALE", 409),
  categoryInvalid: () => domainError("DOCUMENT_CATEGORY_INVALID", 400),
  categoryNameTaken: () =>
    domainError("DOCUMENT_CATEGORY_NAME_TAKEN", 409, {
      name: "documents.errors.DOCUMENT_CATEGORY_NAME_TAKEN",
    }),
  categoryLimit: () => domainError("DOCUMENT_CATEGORY_LIMIT", 409),
  categorySystem: () => domainError("DOCUMENT_CATEGORY_SYSTEM", 409),
  generatedReadOnly: () => domainError("DOCUMENT_GENERATED_READ_ONLY", 409),
  archiveReasonRequired: () =>
    domainError("DOCUMENT_ARCHIVE_REASON_REQUIRED", 400, {
      reason: "documents.errors.DOCUMENT_ARCHIVE_REASON_REQUIRED",
    }),
  alreadyArchived: () => domainError("DOCUMENT_ALREADY_ARCHIVED", 409),
  notArchived: () => domainError("DOCUMENT_NOT_ARCHIVED", 409),
  templateNotFound: () => domainError("DOCUMENT_TEMPLATE_NOT_FOUND", 404),
  templateLimit: () => domainError("DOCUMENT_TEMPLATE_LIMIT", 409),
  templateNameTaken: () =>
    domainError("DOCUMENT_TEMPLATE_NAME_TAKEN", 409, {
      name: "documents.errors.DOCUMENT_TEMPLATE_NAME_TAKEN",
    }),
  templateEmpty: () =>
    domainError("DOCUMENT_TEMPLATE_EMPTY", 400, { bodyHtml: "documents.errors.DOCUMENT_TEMPLATE_EMPTY" }),
  templateTooLong: () =>
    domainError("DOCUMENT_TEMPLATE_TOO_LONG", 400, {
      bodyHtml: "documents.errors.DOCUMENT_TEMPLATE_TOO_LONG",
    }),
  templateUnknownVariable: (variable: string) =>
    domainError(
      "DOCUMENT_TEMPLATE_UNKNOWN_VARIABLE",
      400,
      { bodyHtml: "documents.errors.DOCUMENT_TEMPLATE_UNKNOWN_VARIABLE" },
      { variable },
    ),
  templateInvalidField: (field: string) =>
    domainError(
      "DOCUMENT_TEMPLATE_INVALID_FIELD",
      400,
      { bodyHtml: "documents.errors.DOCUMENT_TEMPLATE_INVALID_FIELD" },
      { field },
    ),
  templateClinicalOnly: () => domainError("DOCUMENT_TEMPLATE_CLINICAL_ONLY", 403),
  signerNotAllowed: () => domainError("DOCUMENT_SIGNER_NOT_ALLOWED", 403),
  professionalInvalid: () => domainError("DOCUMENT_PROFESSIONAL_INVALID", 400),
  unitInvalid: () => domainError("DOCUMENT_UNIT_INVALID", 400),
  // The list of what is missing travels in `details`, so the dialog can ask for confirmation.
  missingValues: (missing: { variable: string }[]): DomainError => ({
    ...domainError("DOCUMENT_MISSING_VALUES", 409),
    details: { missing },
  }),
  generationFailed: () => domainError("DOCUMENT_GENERATION_FAILED", 503),
  validation: (fields: Record<string, string>) => domainError("VALIDATION_FAILED", 400, fields),
} as const;
