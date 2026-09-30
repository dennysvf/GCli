import type { MessageCatalog } from "@/shared/kernel/action-result";

// pt-BR messages for units error codes (PRD F02 Error Handling). {count} is filled from the error.
export const unitsMessages: MessageCatalog = {
  VALIDATION_FAILED: "Verifique os campos destacados.",
  AUTH_UNAUTHENTICATED: "Sua sessão expirou. Entre novamente para continuar.",
  AUTHZ_FORBIDDEN: "Você não tem permissão para acessar esta página.",
  CONFLICT_STALE_VERSION:
    "Estes dados foram alterados por outra pessoa. Recarregue a página e tente novamente.",
  UNITS_NOT_FOUND: "Unidade ou sala não encontrada.",
  UNITS_NAME_TAKEN: "Já existe uma unidade com este nome.",
  UNITS_ROOM_NAME_TAKEN: "Já existe uma sala com este nome.",
  UNITS_UNIT_LIMIT: "Limite de 20 unidades ativas atingido.",
  UNITS_ROOM_LIMIT: "Limite de 30 salas ativas nesta unidade atingido.",
  UNITS_CLOSURE_LIMIT: "Limite de 100 fechamentos futuros nesta unidade atingido.",
  UNITS_INVALID_CNPJ: "CNPJ inválido.",
  UNITS_INVALID_HOURS: "Verifique os horários destacados.",
  UNITS_ROOM_HAS_APPOINTMENTS:
    "Esta sala possui {count} agendamentos futuros. Reatribua-os antes de desativar.",
  UNITS_UNIT_HAS_APPOINTMENTS:
    "Esta unidade possui {count} agendamentos futuros. Reatribua-os ou cancele-os antes de desativar.",
  UNITS_CLOSURE_CONFIRMATION_REQUIRED:
    "Existem {count} agendamentos neste período. Eles não serão cancelados automaticamente.",
  UNITS_CLOSURE_IN_PAST: "Fechamentos passados não podem ser removidos.",
  UNITS_UNIT_INACTIVE: "Esta unidade está desativada. Reative-a antes de alterá-la.",
};
