import { domainError } from "@/shared/kernel/errors";

// Services error codes (spec F03 section 5). Messages live in ../messages.ts.
export const ServicesErrors = {
  notFound: () => domainError("SERVICES_NOT_FOUND", 404),
  nameTaken: () => domainError("SERVICES_NAME_TAKEN", 409, { name: "Já existe um serviço com este nome." }),
  serviceLimit: () => domainError("SERVICES_SERVICE_LIMIT", 422),
  invalidRooms: () =>
    domainError("SERVICES_INVALID_ROOMS", 400, { allowedRoomIds: "Selecione apenas salas ativas." }),
  categoryNotFound: (field?: boolean) =>
    domainError(
      "SERVICES_CATEGORY_NOT_FOUND",
      404,
      field ? { categoryId: "Categoria não encontrada." } : undefined,
    ),
  categoryNameTaken: () =>
    domainError("SERVICES_CATEGORY_NAME_TAKEN", 409, { name: "Já existe uma categoria com este nome." }),
  categoryLimit: () => domainError("SERVICES_CATEGORY_LIMIT", 422),
  categoryInUse: (count: number) => domainError("SERVICES_CATEGORY_IN_USE", 409, undefined, { count }),
} as const;
