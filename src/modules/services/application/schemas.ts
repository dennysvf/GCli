import { z } from "zod";
import {
  ALLOWED_ROOMS_MAX,
  CATEGORY_NAME_MAX,
  SERVICE_DESCRIPTION_MAX,
  SERVICE_NAME_MAX,
  SERVICE_NAME_MIN,
} from "../domain/limits";
import { SERVICE_COLORS } from "../domain/palette";
import { isValidDuration, isValidPriceCents } from "../domain/service-rules";

// Zod schemas shared by the services forms and use cases. Messages are pt-BR (PRD F03).
export const DURATION_MESSAGE = "A duração deve ser entre 5 e 480 minutos, em múltiplos de 5.";
export const PRICE_MESSAGE = "O preço deve ser entre R$ 0,00 e R$ 99.999,99.";

export const SERVICE_STATUSES = ["active", "inactive", "all"] as const;
export type ServiceStatusFilter = (typeof SERVICE_STATUSES)[number];

const serviceFields = {
  name: z
    .string()
    .trim()
    .min(SERVICE_NAME_MIN, "Informe o nome do serviço.")
    .max(SERVICE_NAME_MAX, "O nome deve ter no máximo 100 caracteres."),
  categoryId: z.uuid({ error: "Selecione uma categoria." }),
  description: z
    .string()
    .trim()
    .max(SERVICE_DESCRIPTION_MAX, "A descrição deve ter no máximo 500 caracteres.")
    .nullish()
    .transform((value) => value || null),
  durationMinutes: z.number({ error: DURATION_MESSAGE }).refine(isValidDuration, DURATION_MESSAGE),
  priceCents: z.number({ error: PRICE_MESSAGE }).refine(isValidPriceCents, PRICE_MESSAGE),
  color: z.enum(SERVICE_COLORS, { error: "Selecione uma cor." }),
  requiresRoom: z.boolean(),
  allowedRoomIds: z
    .array(z.uuid())
    .max(ALLOWED_ROOMS_MAX)
    .nullish()
    .transform((ids) => [...new Set(ids ?? [])]),
};

export const createServiceSchema = z.object(serviceFields);
export const updateServiceSchema = createServiceSchema.extend({
  serviceId: z.uuid(),
  version: z.number().int(),
});
export const setServiceActiveSchema = z.object({ serviceId: z.uuid(), active: z.boolean() });

// Page filters come from the URL; invalid values fall back to the defaults.
export const listServicesSchema = z.object({
  search: z
    .string()
    .trim()
    .max(SERVICE_NAME_MAX)
    .optional()
    .catch(undefined)
    .transform((value) => value || undefined),
  categoryId: z.uuid().optional().catch(undefined),
  status: z.enum(SERVICE_STATUSES).catch("active").default("active"),
});

const categoryName = z
  .string()
  .trim()
  .min(1, "Informe o nome da categoria.")
  .max(CATEGORY_NAME_MAX, "O nome deve ter no máximo 50 caracteres.");

export const createCategorySchema = z.object({ name: categoryName });
export const renameCategorySchema = z.object({ categoryId: z.uuid(), name: categoryName });
export const moveCategorySchema = z.object({ categoryId: z.uuid(), direction: z.enum(["up", "down"]) });
export const deleteCategorySchema = z.object({ categoryId: z.uuid() });
