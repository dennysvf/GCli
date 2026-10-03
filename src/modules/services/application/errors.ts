import { domainError } from "@/shared/kernel/errors";

// Services error codes (spec F03 section 5). Texts live in the catalog under services.errors.
export const ServicesErrors = {
  notFound: () => domainError("SERVICES_NOT_FOUND", 404),
  nameTaken: () => domainError("SERVICES_NAME_TAKEN", 409, { name: "services.errors.SERVICES_NAME_TAKEN" }),
  serviceLimit: () => domainError("SERVICES_SERVICE_LIMIT", 422),
  invalidRooms: () =>
    domainError("SERVICES_INVALID_ROOMS", 400, { allowedRoomIds: "services.errors.SERVICES_INVALID_ROOMS" }),
  categoryNotFound: (field?: boolean) =>
    domainError(
      "SERVICES_CATEGORY_NOT_FOUND",
      404,
      field ? { categoryId: "services.errors.SERVICES_CATEGORY_NOT_FOUND" } : undefined,
    ),
  categoryNameTaken: () =>
    domainError("SERVICES_CATEGORY_NAME_TAKEN", 409, {
      name: "services.errors.SERVICES_CATEGORY_NAME_TAKEN",
    }),
  categoryLimit: () => domainError("SERVICES_CATEGORY_LIMIT", 422),
  // One price is needed for each currency in use by the active units (PRD F16).
  priceRequired: (currencies: string[]) =>
    domainError(
      "SERVICES_PRICE_REQUIRED",
      400,
      Object.fromEntries(
        currencies.map((currency) => [
          `prices.${currency}`,
          `services.errors.SERVICES_PRICE_REQUIRED?currency=${currency}`,
        ]),
      ),
      { currency: currencies.join(", ") },
    ),
  categoryInUse: (count: number) => domainError("SERVICES_CATEGORY_IN_USE", 409, undefined, { count }),
} as const;
