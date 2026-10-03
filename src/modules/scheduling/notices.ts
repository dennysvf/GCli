import type { MessageCatalog } from "@/shared/kernel/action-result";

// Texts that are not errors (conflict findings, toasts and labels); they move to the catalog with the
// interface texts and the finding codes (PRD F16).
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
