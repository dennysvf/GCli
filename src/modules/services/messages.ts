import type { MessageCatalog } from "@/shared/kernel/action-result";

// pt-BR messages for services error codes (PRD F03 Error Handling). {count} is filled from the error.
export const servicesMessages: MessageCatalog = {
  VALIDATION_FAILED: "Verifique os campos destacados.",
  AUTH_UNAUTHENTICATED: "Sua sessão expirou. Entre novamente para continuar.",
  AUTHZ_FORBIDDEN: "Você não tem permissão para acessar esta página.",
  CONFLICT_STALE_VERSION:
    "Estes dados foram alterados por outra pessoa. Recarregue a página e tente novamente.",
  SERVICES_NOT_FOUND: "Serviço não encontrado.",
  SERVICES_NAME_TAKEN: "Já existe um serviço com este nome.",
  SERVICES_SERVICE_LIMIT: "Limite de 500 serviços ativos atingido.",
  SERVICES_INVALID_ROOMS: "Selecione apenas salas ativas.",
  SERVICES_CATEGORY_NOT_FOUND: "Categoria não encontrada.",
  SERVICES_CATEGORY_NAME_TAKEN: "Já existe uma categoria com este nome.",
  SERVICES_CATEGORY_LIMIT: "Limite de 50 categorias atingido.",
  SERVICES_CATEGORY_IN_USE:
    "Esta categoria possui {count} serviços. Mova-os para outra categoria antes de excluí-la.",
};

// Texts that are not errors (PRD F03 Experience and Error Handling).
export const SERVICES_DEACTIVATED_WITH_APPOINTMENTS =
  "{count} agendamentos futuros deste serviço foram mantidos.";
export const SERVICES_PRICE_CHANGE_CONFIRMATION =
  "O novo preço valerá para novos agendamentos. Agendamentos existentes mantêm o preço original.";
