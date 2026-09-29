import type { MessageCatalog } from "@/shared/kernel/action-result";

// pt-BR messages for every identity error code. Text comes from PRD F01 (Error Handling and
// Experience) where the PRD defines it.
export const identityMessages: MessageCatalog = {
  VALIDATION_FAILED: "Verifique os campos destacados.",
  AUTH_UNAUTHENTICATED: "Sua sessão expirou. Entre novamente para continuar.",
  AUTH_INVALID_CREDENTIALS: "E-mail ou senha inválidos.",
  AUTH_ACCOUNT_LOCKED:
    "Conta bloqueada temporariamente por excesso de tentativas. Tente novamente em 15 minutos.",
  AUTH_RATE_LIMITED: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  AUTH_LINK_INVALID: "Este link expirou ou já foi utilizado. Solicite um novo.",
  AUTHZ_FORBIDDEN: "Você não tem permissão para acessar esta página.",
  IDENTITY_LAST_ADMIN: "É necessário manter pelo menos um administrador ativo.",
  IDENTITY_SELF_DEACTIVATION: "Você não pode desativar o próprio usuário.",
  IDENTITY_EMAIL_IN_USE: "Já existe um usuário com este e-mail.",
  IDENTITY_INVITATION_PENDING: "Já existe um convite pendente para este e-mail.",
  IDENTITY_INVITATION_NOT_PENDING: "Este convite não está mais pendente.",
  IDENTITY_USER_LIMIT: "Limite de 100 usuários atingido.",
  IDENTITY_USER_NOT_FOUND: "Usuário não encontrado.",
  ORG_INVALID_CNPJ: "CNPJ inválido.",
  ORG_LOGO_INVALID: "Envie um logotipo PNG, JPG ou SVG de até 2 MB.",
  CONFLICT_STALE_VERSION:
    "Estes dados foram alterados por outra pessoa. Recarregue a página e tente novamente.",
};

export const PASSWORD_RESET_REQUESTED_MESSAGE =
  "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.";
