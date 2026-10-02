import type { MessageCatalog } from "@/shared/kernel/action-result";

// pt-BR messages for patients error codes (PRD F05 Error Handling). {placeholders} are filled from
// the error's params.
export const patientsMessages: MessageCatalog = {
  VALIDATION_FAILED: "Verifique os campos destacados.",
  AUTH_UNAUTHENTICATED: "Sua sessão expirou. Entre novamente para continuar.",
  AUTHZ_FORBIDDEN: "Você não tem permissão para acessar esta página.",
  CONFLICT_STALE_VERSION:
    "Estes dados foram alterados por outra pessoa. Recarregue a página e tente novamente.",
  PATIENTS_NOT_FOUND: "Paciente não encontrado.",
  PATIENTS_INVALID_CPF: "CPF inválido.",
  PATIENTS_CPF_TAKEN: "Este CPF já está cadastrado para {name}.",
  PATIENTS_GUARDIAN_REQUIRED: "Pacientes menores de 18 anos precisam de um responsável cadastrado.",
  PATIENTS_STALE_VERSION:
    "Este cadastro foi alterado por {author} às {time}. Revise as alterações antes de salvar.",
  PATIENTS_HAS_FUTURE_APPOINTMENTS:
    "O paciente possui {count} agendamentos futuros. Cancele-os antes de inativar.",
  PATIENTS_INACTIVE: "Este paciente está inativo. Reative o cadastro antes de alterá-lo.",
  PATIENTS_SEARCH_TOO_SHORT: "Digite pelo menos 3 caracteres para buscar.",
  PATIENTS_TAG_LIMIT: "Use no máximo 10 etiquetas por paciente.",
  PATIENTS_INVALID_OPTION: "Selecione uma opção ativa da lista.",
  PATIENTS_LIST_NAME_TAKEN: "Já existe um item com este nome.",
  PATIENTS_LIST_LIMIT: "Limite de {max} itens ativos atingido.",
  PATIENTS_NO_TERMS: "Publique os termos de privacidade antes de registrar consentimentos.",
  PATIENTS_INVALID_FILE: "Envie um arquivo PDF, JPG ou PNG de até 10 MB.",
  PATIENTS_UPLOAD_NOT_FOUND: "O arquivo enviado expirou. Envie-o novamente.",
};

// Notices that are not errors.
export const PATIENTS_INCOMPLETE_RECORD = "Cadastro incompleto. Informe o CPF e registre o consentimento.";
export const PATIENTS_POSSIBLE_DUPLICATE = "Encontramos um cadastro com o mesmo nome e data de nascimento.";
export const PATIENTS_TERMS_PUBLISHED =
  "Nova versão dos termos publicada. Os pacientes passam a ter consentimento pendente.";
export const PATIENTS_NOT_VISIBLE = "Você vê apenas pacientes que têm agendamento com você.";
