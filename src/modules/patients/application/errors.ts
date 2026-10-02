import { CommonErrors, domainError } from "@/shared/kernel/errors";

// Patients error codes (spec F05 section 5). Messages live in ../messages.ts.
export const PatientsErrors = {
  notFound: () => domainError("PATIENTS_NOT_FOUND", 404),
  invalidCpf: (field: "cpf" | "guardian.cpf" = "cpf") =>
    domainError("PATIENTS_INVALID_CPF", 400, { [field]: "CPF inválido." }),
  // PRD F05: the message names the existing record and the form links to it.
  cpfTaken: (abbreviatedName: string, existingPatientId: string) =>
    domainError(
      "PATIENTS_CPF_TAKEN",
      409,
      { cpf: `Este CPF já está cadastrado para ${abbreviatedName}.`, existingPatientId },
      { name: abbreviatedName },
    ),
  guardianRequired: () =>
    domainError("PATIENTS_GUARDIAN_REQUIRED", 400, {
      "guardian.name": "Pacientes menores de 18 anos precisam de um responsável cadastrado.",
    }),
  staleVersion: (author: string, time: string) =>
    domainError("PATIENTS_STALE_VERSION", 409, undefined, { author, time }),
  hasFutureAppointments: (count: number) =>
    domainError("PATIENTS_HAS_FUTURE_APPOINTMENTS", 409, undefined, { count }),
  inactive: () => domainError("PATIENTS_INACTIVE", 409),
  searchTooShort: () => domainError("PATIENTS_SEARCH_TOO_SHORT", 400),
  tagLimit: () =>
    domainError("PATIENTS_TAG_LIMIT", 400, { tagIds: "Use no máximo 10 etiquetas por paciente." }),
  invalidOption: (field: "referralSourceId" | "tagIds") =>
    domainError("PATIENTS_INVALID_OPTION", 400, { [field]: "Selecione uma opção ativa da lista." }),
  listNameTaken: () =>
    domainError("PATIENTS_LIST_NAME_TAKEN", 409, { name: "Já existe um item com este nome." }),
  listLimit: (max: number) => domainError("PATIENTS_LIST_LIMIT", 422, undefined, { max }),
  noTerms: () => domainError("PATIENTS_NO_TERMS", 409),
  invalidFile: () => domainError("PATIENTS_INVALID_FILE", 400),
  uploadNotFound: () => domainError("PATIENTS_UPLOAD_NOT_FOUND", 404),
  validation: (fields: Record<string, string>) => CommonErrors.validationFailed(fields),
} as const;
