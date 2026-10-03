import { domainError } from "@/shared/kernel/errors";

// Units error codes (spec F02 section 5). Texts live in the catalog under units.errors.
export const UnitsErrors = {
  notFound: () => domainError("UNITS_NOT_FOUND", 404),
  nameTaken: () => domainError("UNITS_NAME_TAKEN", 409, { name: "units.errors.UNITS_NAME_TAKEN" }),
  roomNameTaken: () =>
    domainError("UNITS_ROOM_NAME_TAKEN", 409, { name: "units.errors.UNITS_ROOM_NAME_TAKEN" }),
  unitLimit: () => domainError("UNITS_UNIT_LIMIT", 422),
  roomLimit: () => domainError("UNITS_ROOM_LIMIT", 422),
  closureLimit: () => domainError("UNITS_CLOSURE_LIMIT", 422),
  // The type is the tax ID abbreviation of the unit's country, the same in every language.
  invalidTaxId: (type: string) =>
    domainError("TAX_ID_INVALID", 400, { taxId: "errors.TAX_ID_INVALID" }, { type }),
  countryLocked: () =>
    domainError("UNITS_COUNTRY_LOCKED", 409, { country: "units.errors.UNITS_COUNTRY_LOCKED" }),
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
