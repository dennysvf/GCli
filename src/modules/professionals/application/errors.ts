import { CommonErrors, domainError } from "@/shared/kernel/errors";

// Professionals error codes (spec F04 section 5). Texts live in the catalog under professionals.errors.
export const ProfessionalsErrors = {
  notFound: () => domainError("PROFESSIONALS_NOT_FOUND", 404),
  limit: () => domainError("PROFESSIONALS_LIMIT", 422),
  inactive: () => domainError("PROFESSIONALS_INACTIVE", 409),
  // The type is the abbreviation of the document ("CPF", "DNI"), the same in every language.
  documentTaken: (type: string) =>
    domainError(
      "PROFESSIONALS_DOCUMENT_TAKEN",
      409,
      { "document.number": "professionals.errors.PROFESSIONALS_DOCUMENT_TAKEN" },
      { type },
    ),
  councilTaken: () =>
    domainError("PROFESSIONALS_COUNCIL_TAKEN", 409, {
      registrations: "professionals.errors.PROFESSIONALS_COUNCIL_TAKEN",
    }),
  registrationDuplicate: () =>
    domainError("PROFESSIONALS_REGISTRATION_DUPLICATE", 400, {
      registrations: "professionals.validation.oneRegistrationPerCountry",
    }),
  // A working interval in a unit needs a registration in the unit's country (PRD F16).
  registrationRequired: (fields: Record<string, string>, country: string, unit: string) =>
    domainError("PROFESSIONALS_REGISTRATION_REQUIRED", 400, fields, { country, unit }),
  userAlreadyLinked: () =>
    domainError("PROFESSIONALS_USER_ALREADY_LINKED", 409, {
      linkedUserId: "professionals.errors.PROFESSIONALS_USER_ALREADY_LINKED",
    }),
  userNotLinkable: () =>
    domainError("PROFESSIONALS_USER_NOT_LINKABLE", 400, {
      linkedUserId: "professionals.errors.PROFESSIONALS_USER_NOT_LINKABLE",
    }),
  hasFutureAppointments: (count: number) =>
    domainError("PROFESSIONALS_HAS_FUTURE_APPOINTMENTS", 409, undefined, { count }),
  invalidServices: () =>
    domainError("PROFESSIONALS_INVALID_SERVICES", 400, {
      serviceIds: "professionals.errors.PROFESSIONALS_INVALID_SERVICES",
    }),
  invalidUnits: (fields: Record<string, string>) => domainError("PROFESSIONALS_INVALID_UNITS", 400, fields),
  invalidIntervals: (fields: Record<string, string>) =>
    domainError("PROFESSIONALS_INVALID_INTERVALS", 400, fields),
  crossUnitConflict: (fields: Record<string, string>, params: Record<string, string>) =>
    domainError("PROFESSIONALS_CROSS_UNIT_CONFLICT", 409, fields, params),
  outsideBusinessHours: (fields: Record<string, string>, params: Record<string, string>) =>
    domainError("PROFESSIONALS_OUTSIDE_BUSINESS_HOURS", 400, fields, params),
  // `date` is already formatted for the requester's language.
  scheduleOverlap: (date: string) =>
    domainError(
      "PROFESSIONALS_SCHEDULE_OVERLAP",
      409,
      { validFrom: "professionals.errors.PROFESSIONALS_SCHEDULE_OVERLAP" },
      { date },
    ),
  scheduleEnded: () => domainError("PROFESSIONALS_SCHEDULE_ENDED", 409),
  scheduleStarted: () => domainError("PROFESSIONALS_SCHEDULE_STARTED", 409),
  timeOffTooFar: () =>
    domainError("PROFESSIONALS_TIME_OFF_TOO_FAR", 400, {
      endsAt: "professionals.errors.PROFESSIONALS_TIME_OFF_TOO_FAR",
    }),
  timeOffEnded: () => domainError("PROFESSIONALS_TIME_OFF_ENDED", 409),
  validation: (fields: Record<string, string>) => CommonErrors.validationFailed(fields),
} as const;
