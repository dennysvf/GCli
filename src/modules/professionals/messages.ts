import type { MessageCatalog } from "@/shared/kernel/action-result";
import { CROSS_UNIT_CONFLICT_TEMPLATE, OUTSIDE_BUSINESS_HOURS_TEMPLATE } from "./domain/working-hours-text";

// pt-BR messages for professionals error codes (PRD F04 Error Handling). {placeholders} are filled
// from the error's params.
export const professionalsMessages: MessageCatalog = {
  VALIDATION_FAILED: "Verifique os campos destacados.",
  AUTH_UNAUTHENTICATED: "Sua sessão expirou. Entre novamente para continuar.",
  AUTHZ_FORBIDDEN: "Você não tem permissão para acessar esta página.",
  CONFLICT_STALE_VERSION:
    "Estes dados foram alterados por outra pessoa. Recarregue a página e tente novamente.",
  PROFESSIONALS_NOT_FOUND: "Profissional não encontrado.",
  PROFESSIONALS_LIMIT: "Limite de 100 profissionais ativos atingido.",
  PROFESSIONALS_INACTIVE: "Este profissional está desativado. Reative-o antes de alterá-lo.",
  PROFESSIONALS_INVALID_CPF: "CPF inválido.",
  PROFESSIONALS_CPF_TAKEN: "Este CPF já está cadastrado para outro profissional.",
  PROFESSIONALS_COUNCIL_TAKEN: "Este registro de conselho já está cadastrado para outro profissional.",
  PROFESSIONALS_USER_ALREADY_LINKED: "Este usuário já está vinculado a outro profissional.",
  PROFESSIONALS_USER_NOT_LINKABLE:
    "Selecione um usuário ativo com perfil Profissional, Gerente ou Administrador.",
  PROFESSIONALS_HAS_FUTURE_APPOINTMENTS:
    "Existem {count} agendamentos futuros. Reagende ou cancele antes de desativar.",
  PROFESSIONALS_INVALID_SERVICES: "Selecione apenas serviços ativos.",
  PROFESSIONALS_INVALID_UNITS: "Selecione apenas unidades ativas.",
  PROFESSIONALS_INVALID_INTERVALS: "Verifique os horários destacados.",
  PROFESSIONALS_CROSS_UNIT_CONFLICT: CROSS_UNIT_CONFLICT_TEMPLATE,
  PROFESSIONALS_OUTSIDE_BUSINESS_HOURS: OUTSIDE_BUSINESS_HOURS_TEMPLATE,
  PROFESSIONALS_SCHEDULE_OVERLAP:
    "Já existe um horário com vigência a partir de {date}. Edite-o ou escolha outra data.",
  PROFESSIONALS_SCHEDULE_ENDED: "Horários encerrados não podem ser alterados.",
  PROFESSIONALS_SCHEDULE_STARTED: "Horários já vigentes não podem ser excluídos. Defina uma data de término.",
  PROFESSIONALS_TIME_OFF_TOO_FAR: "A ausência deve terminar em até 1 ano a partir de hoje.",
  PROFESSIONALS_TIME_OFF_ENDED: "Ausências encerradas não podem ser excluídas.",
};

// Notices that are not errors.
export const PROFESSIONALS_SERVICES_REMOVED_WITH_APPOINTMENTS =
  "{count} agendamentos futuros dos serviços removidos foram mantidos.";
export const PROFESSIONALS_TIME_OFF_AFFECTED_APPOINTMENTS =
  "Existem {count} agendamentos neste período. Eles não foram cancelados. Reagende cada um:";
export const PROFESSIONALS_SCHEDULE_PREVIOUS_CLOSED = "O horário anterior passa a valer até {date}.";
export const PROFESSIONALS_DEACTIVATE_CONFIRMATION =
  "O profissional deixa de aparecer para novos agendamentos. O histórico é mantido.";
export const PROFESSIONALS_NOT_LINKED =
  "Seu usuário não está vinculado a um profissional. Fale com o administrador da clínica.";
