import { CommonErrors, domainError } from "@/shared/kernel/errors";

// Professionals error codes (spec F04 section 5). Messages live in ../messages.ts.
export const ProfessionalsErrors = {
  notFound: () => domainError("PROFESSIONALS_NOT_FOUND", 404),
  limit: () => domainError("PROFESSIONALS_LIMIT", 422),
  inactive: () => domainError("PROFESSIONALS_INACTIVE", 409),
  invalidCpf: () => domainError("PROFESSIONALS_INVALID_CPF", 400, { cpf: "CPF inválido." }),
  cpfTaken: () =>
    domainError("PROFESSIONALS_CPF_TAKEN", 409, {
      cpf: "Este CPF já está cadastrado para outro profissional.",
    }),
  councilTaken: () =>
    domainError("PROFESSIONALS_COUNCIL_TAKEN", 409, {
      councilNumber: "Este registro de conselho já está cadastrado para outro profissional.",
    }),
  userAlreadyLinked: () =>
    domainError("PROFESSIONALS_USER_ALREADY_LINKED", 409, {
      linkedUserId: "Este usuário já está vinculado a outro profissional.",
    }),
  userNotLinkable: () =>
    domainError("PROFESSIONALS_USER_NOT_LINKABLE", 400, {
      linkedUserId: "Selecione um usuário ativo com perfil Profissional, Gerente ou Administrador.",
    }),
  hasFutureAppointments: (count: number) =>
    domainError("PROFESSIONALS_HAS_FUTURE_APPOINTMENTS", 409, undefined, { count }),
  invalidServices: () =>
    domainError("PROFESSIONALS_INVALID_SERVICES", 400, { serviceIds: "Selecione apenas serviços ativos." }),
  invalidUnits: (fields: Record<string, string>) => domainError("PROFESSIONALS_INVALID_UNITS", 400, fields),
  invalidIntervals: (fields: Record<string, string>) =>
    domainError("PROFESSIONALS_INVALID_INTERVALS", 400, fields),
  crossUnitConflict: (fields: Record<string, string>, params: Record<string, string>) =>
    domainError("PROFESSIONALS_CROSS_UNIT_CONFLICT", 409, fields, params),
  outsideBusinessHours: (fields: Record<string, string>, hours: string) =>
    domainError("PROFESSIONALS_OUTSIDE_BUSINESS_HOURS", 400, fields, { hours }),
  scheduleOverlap: (date: string) =>
    domainError(
      "PROFESSIONALS_SCHEDULE_OVERLAP",
      409,
      { validFrom: `Já existe um horário com vigência a partir de ${date}.` },
      { date },
    ),
  scheduleEnded: () => domainError("PROFESSIONALS_SCHEDULE_ENDED", 409),
  scheduleStarted: () => domainError("PROFESSIONALS_SCHEDULE_STARTED", 409),
  timeOffTooFar: () =>
    domainError("PROFESSIONALS_TIME_OFF_TOO_FAR", 400, {
      endsAt: "A ausência deve terminar em até 1 ano a partir de hoje.",
    }),
  timeOffEnded: () => domainError("PROFESSIONALS_TIME_OFF_ENDED", 409),
  validation: (fields: Record<string, string>) => CommonErrors.validationFailed(fields),
} as const;
