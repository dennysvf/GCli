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
      exceptionJustification: "Justifique a exceção para salvar.",
    }),
    ...(details ? { details } : {}),
  }),
  slotTaken: () => domainError("SCHEDULING_SLOT_TAKEN", 409),
  serviceNotEnabled: () =>
    domainError("SCHEDULING_SERVICE_NOT_ENABLED", 400, {
      professionalId: "Este profissional não realiza o serviço escolhido.",
    }),
  roomRequired: () =>
    domainError("SCHEDULING_ROOM_REQUIRED", 400, { roomId: "Este serviço exige uma sala." }),
  roomNotAllowed: () =>
    domainError("SCHEDULING_ROOM_NOT_ALLOWED", 400, {
      roomId: "Esta sala não está liberada para o serviço nesta unidade.",
    }),
  noRoomAvailable: () => domainError("SCHEDULING_NO_ROOM_AVAILABLE", 409),
  inactiveResource: (resource: string) =>
    domainError("SCHEDULING_INACTIVE_RESOURCE", 409, undefined, { resource }),
  invalidStart: (granularity: number) =>
    domainError(
      "SCHEDULING_INVALID_START",
      400,
      { startTime: `Escolha um horário múltiplo de ${granularity} minutos.` },
      { granularity },
    ),
  invalidTransition: (from: string, to: string) =>
    domainError("SCHEDULING_INVALID_TRANSITION", 409, undefined, { from, to }),
  noShowTooEarly: () => domainError("SCHEDULING_NO_SHOW_TOO_EARLY", 409),
  undoExpired: () => domainError("SCHEDULING_UNDO_EXPIRED", 409),
  cancellationIncomplete: () =>
    domainError("SCHEDULING_CANCELLATION_INCOMPLETE", 400, {
      origin: "Informe a origem do cancelamento.",
      reasonId: "Informe o motivo do cancelamento.",
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
    domainError("SCHEDULING_LIST_NAME_TAKEN", 409, { name: "Já existe um motivo com este nome." }),
  listLimit: (max: number) => domainError("SCHEDULING_LIST_LIMIT", 422, undefined, { max }),
  invalidReason: () =>
    domainError("SCHEDULING_INVALID_REASON", 400, { reasonId: "Selecione um motivo ativo da lista." }),
} satisfies Record<string, (...args: never[]) => DomainError>;
