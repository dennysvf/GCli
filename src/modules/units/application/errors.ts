import { domainError } from "@/shared/kernel/errors";

// Units error codes (spec F02 section 5). Messages live in ../messages.ts.
export const UnitsErrors = {
  notFound: () => domainError("UNITS_NOT_FOUND", 404),
  nameTaken: () => domainError("UNITS_NAME_TAKEN", 409, { name: "Já existe uma unidade com este nome." }),
  roomNameTaken: () =>
    domainError("UNITS_ROOM_NAME_TAKEN", 409, { name: "Já existe uma sala com este nome." }),
  unitLimit: () => domainError("UNITS_UNIT_LIMIT", 422),
  roomLimit: () => domainError("UNITS_ROOM_LIMIT", 422),
  closureLimit: () => domainError("UNITS_CLOSURE_LIMIT", 422),
  invalidCnpj: () => domainError("UNITS_INVALID_CNPJ", 400, { cnpj: "CNPJ inválido." }),
  invalidHours: (fields: Record<string, string>) => domainError("UNITS_INVALID_HOURS", 400, fields),
  roomHasAppointments: (count: number) =>
    domainError("UNITS_ROOM_HAS_APPOINTMENTS", 409, undefined, { count }),
  unitHasAppointments: (count: number) =>
    domainError("UNITS_UNIT_HAS_APPOINTMENTS", 409, undefined, { count }),
  closureConfirmationRequired: (count: number) =>
    domainError("UNITS_CLOSURE_CONFIRMATION_REQUIRED", 409, undefined, { count }),
  closureInPast: () => domainError("UNITS_CLOSURE_IN_PAST", 400),
  unitInactive: () => domainError("UNITS_UNIT_INACTIVE", 409),
} as const;
