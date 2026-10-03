import { domainError, type DomainError } from "@/shared/kernel/errors";

// Stable error codes of the scheduling module (spec F06 section 5). The pt-BR texts live in
// ../messages.ts, keyed by code; params fill their {placeholders}.
export const SchedulingErrors = {
  notFound: () => domainError("SCHEDULING_NOT_FOUND", 404),
  conflicts: (details: Record<string, unknown>) => ({
    ...domainError("SCHEDULING_CONFLICTS", 409),
    details,
  }),
  justificationRequired: (details?: Record<string, unknown>) => ({
    ...domainError("SCHEDULING_JUSTIFICATION_REQUIRED", 400, {
      exceptionJustification: "scheduling.errors.SCHEDULING_JUSTIFICATION_REQUIRED",
    }),
    ...(details ? { details } : {}),
  }),
  slotTaken: () => domainError("SCHEDULING_SLOT_TAKEN", 409),
  serviceNotEnabled: () =>
    domainError("SCHEDULING_SERVICE_NOT_ENABLED", 400, {
      professionalId: "scheduling.errors.SCHEDULING_SERVICE_NOT_ENABLED",
    }),
  roomRequired: () =>
    domainError("SCHEDULING_ROOM_REQUIRED", 400, { roomId: "scheduling.errors.SCHEDULING_ROOM_REQUIRED" }),
  roomNotAllowed: () =>
    domainError("SCHEDULING_ROOM_NOT_ALLOWED", 400, {
      roomId: "scheduling.errors.SCHEDULING_ROOM_NOT_ALLOWED",
    }),
  // The service has no price in the currency of the unit (PRD F16).
  noPriceForCurrency: (currency: string) =>
    domainError("SCHEDULING_NO_PRICE_FOR_CURRENCY", 409, undefined, { currency }),
  noRoomAvailable: () => domainError("SCHEDULING_NO_ROOM_AVAILABLE", 409),
  inactiveResource: (resource: string) =>
    domainError("SCHEDULING_INACTIVE_RESOURCE", 409, undefined, { resource }),
  invalidStart: (granularity: number) =>
    domainError(
      "SCHEDULING_INVALID_START",
      400,
      { startTime: "scheduling.errors.SCHEDULING_INVALID_START" },
      { granularity },
    ),
  invalidTransition: (from: string, to: string) =>
    domainError("SCHEDULING_INVALID_TRANSITION", 409, undefined, { from, to }),
  noShowTooEarly: () => domainError("SCHEDULING_NO_SHOW_TOO_EARLY", 409),
  undoExpired: () => domainError("SCHEDULING_UNDO_EXPIRED", 409),
  cancellationIncomplete: () =>
    domainError("SCHEDULING_CANCELLATION_INCOMPLETE", 400, {
      origin: "scheduling.validation.originRequired",
      reasonId: "scheduling.validation.reasonRequired",
    }),
  notEditable: () => domainError("SCHEDULING_NOT_EDITABLE", 409),
  seriesConflicts: (conflicts: number, total: number, details: Record<string, unknown>) => ({
    ...domainError("SCHEDULING_SERIES_CONFLICTS", 409, undefined, { conflicts, total }),
    details,
  }),
  seriesRuleInvalid: (fields: Record<string, string>) =>
    domainError("SCHEDULING_SERIES_RULE_INVALID", 400, fields),
  notInSeries: () => domainError("SCHEDULING_NOT_IN_SERIES", 400),
  staleVersion: (author: string, time: string) =>
    domainError("SCHEDULING_STALE_VERSION", 409, undefined, { author, time }),
  validation: (fields: Record<string, string>) => domainError("VALIDATION_FAILED", 400, fields),
  listNameTaken: () =>
    domainError("SCHEDULING_LIST_NAME_TAKEN", 409, { name: "scheduling.errors.SCHEDULING_LIST_NAME_TAKEN" }),
  listLimit: (max: number) => domainError("SCHEDULING_LIST_LIMIT", 422, undefined, { max }),
  invalidReason: () =>
    domainError("SCHEDULING_INVALID_REASON", 400, {
      reasonId: "scheduling.errors.SCHEDULING_INVALID_REASON",
    }),
} satisfies Record<string, (...args: never[]) => DomainError>;
