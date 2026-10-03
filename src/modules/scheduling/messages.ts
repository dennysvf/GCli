import type { MessageCatalog } from "@/shared/kernel/action-result";

// pt-BR messages for scheduling error codes and conflict findings (PRD F06 Error Handling; texts
// not given by the PRD follow its tone, spec F06 section 5). {placeholders} come from params.
export const schedulingMessages: MessageCatalog = {
  VALIDATION_FAILED: "Verifique os campos destacados.",
  AUTH_UNAUTHENTICATED: "Sua sessão expirou. Entre novamente para continuar.",
  AUTHZ_FORBIDDEN: "Você não tem permissão para acessar esta página.",
  CONFLICT_STALE_VERSION: "Este agendamento foi alterado por outra pessoa. Atualize a agenda.",
  SCHEDULING_NOT_FOUND: "Agendamento não encontrado.",
  SCHEDULING_CONFLICTS: "Revise os conflitos antes de salvar.",
  SCHEDULING_JUSTIFICATION_REQUIRED: "Justifique a exceção para salvar.",
  SCHEDULING_SLOT_TAKEN:
    "Este horário acabou de ser ocupado por outro agendamento. Atualize a agenda e escolha outro horário.",
  SCHEDULING_SERVICE_NOT_ENABLED: "Este profissional não realiza o serviço escolhido.",
  SCHEDULING_ROOM_REQUIRED: "Este serviço exige uma sala.",
  SCHEDULING_ROOM_NOT_ALLOWED: "Esta sala não está liberada para o serviço nesta unidade.",
  SCHEDULING_NO_ROOM_AVAILABLE: "Nenhuma sala desta unidade está liberada para este serviço.",
  SCHEDULING_INACTIVE_RESOURCE: "{resource} está inativo e não pode ser agendado.",
  SCHEDULING_INVALID_START: "Escolha um horário múltiplo de {granularity} minutos.",
  SCHEDULING_INVALID_TRANSITION: "Não é possível mudar de {from} para {to}.",
  SCHEDULING_NO_SHOW_TOO_EARLY: "Só é possível marcar falta após o horário de início do agendamento.",
  SCHEDULING_UNDO_EXPIRED: "O prazo de 30 minutos para desfazer terminou.",
  SCHEDULING_CANCELLATION_INCOMPLETE: "Informe a origem e o motivo do cancelamento.",
  SCHEDULING_NOT_EDITABLE: "Agendamentos com chegada registrada não podem ser alterados.",
  SCHEDULING_SERIES_CONFLICTS: "{conflicts} de {total} sessões possuem conflito.",
  SCHEDULING_SERIES_RULE_INVALID: "Verifique a recorrência.",
  SCHEDULING_NOT_IN_SERIES: "Este agendamento não faz parte de uma série.",
  SCHEDULING_STALE_VERSION: "Este agendamento foi alterado por {author} às {time}. Atualize a agenda.",
  SCHEDULING_LIST_NAME_TAKEN: "Já existe um motivo com este nome.",
  SCHEDULING_LIST_LIMIT: "Limite de {max} motivos ativos atingido.",
  SCHEDULING_INVALID_REASON: "Selecione um motivo ativo da lista.",
};

// Conflict findings shown in the booking panel (design system 5.11).
export const findingMessages: MessageCatalog = {
  SCHEDULING_PROFESSIONAL_CONFLICT:
    "{professional} já possui atendimento das {start} às {end}. Deseja registrar como encaixe?",
  SCHEDULING_ROOM_CONFLICT: "A {room} está ocupada das {start} às {end}. Escolha outra sala ou horário.",
  SCHEDULING_OUTSIDE_WORKING_HOURS: "Fora do horário de atendimento de {professional} neste dia ({hours}).",
  SCHEDULING_TIME_OFF: "{professional} está em {type} das {start} às {end}.",
  SCHEDULING_OUTSIDE_UNIT_HOURS: "Fora do funcionamento da unidade ({hours}).",
  SCHEDULING_UNIT_CLOSED: "A unidade está fechada nesta data: {reason}.",
  SCHEDULING_PAST_START: "Este horário já passou.",
  SCHEDULING_PATIENT_OVERLAP: "O paciente já tem agendamento das {start} às {end} com {professional}.",
};

export const SCHEDULING_TOASTS = {
  booked: "Agendamento criado",
  seriesBooked: "{count} sessões agendadas",
  statusChanged: "Status alterado para {status}",
  rescheduled: "Agendamento reagendado",
  cancelled: "Agendamento cancelado",
  saved: "Alterações salvas",
  reasonSaved: "Motivo salvo.",
} as const;

export const SCHEDULING_LABELS = {
  overbooking: "Encaixe",
  confirmOverbooking: "Confirmar encaixe",
  justifyException: "Justificar exceção",
  nextFreeSlot: "Próximo horário livre",
  scopeThis: "Somente este",
  scopeFollowing: "Este e os seguintes",
  scopeAllFuture: "Todos os futuros",
  skip: "Pular",
  retime: "Escolher outro horário",
  late: "atrasado {minutes} min",
  rescheduleConfirm: "Reagendar para {weekday}, {time} com {professional}?",
} as const;

export const DEFAULT_CANCELLATION_REASONS = [
  "Imprevisto pessoal",
  "Problema de saúde",
  "Remarcação solicitada pela clínica",
  "Outro",
] as const;
