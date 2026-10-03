import { z } from "zod";
import { messageKey } from "@/shared/i18n/message-key";
import { CURRENCIES, minorUnits } from "@/shared/kernel/countries/codes";
import {
  ALLOWED_ROOMS_MAX,
  CATEGORY_NAME_MAX,
  SERVICE_DESCRIPTION_MAX,
  SERVICE_NAME_MAX,
  SERVICE_NAME_MIN,
} from "../domain/limits";
import { SERVICE_COLORS } from "../domain/palette";
import { isValidDuration, isValidPriceMinor, maxPriceMinor } from "../domain/service-rules";

// Zod schemas shared by the services forms and use cases. Messages are catalog keys
// (services.validation.*, ADR-028), translated where they are shown.
export const DURATION_MESSAGE = "services.validation.duration";

export const SERVICE_STATUSES = ["active", "inactive", "all"] as const;
export type ServiceStatusFilter = (typeof SERVICE_STATUSES)[number];

const priceSchema = z
  .object({
    currency: z.enum(CURRENCIES, { error: "services.validation.currencyInvalid" }),
    amountMinor: z.number({ error: "services.validation.priceInvalid" }),
  })
  .superRefine((price, ctx) => {
    if (!isValidPriceMinor(price.amountMinor, price.currency)) {
      ctx.addIssue({
        code: "custom",
        path: ["amountMinor"],
        message: messageKey("services.validation.priceRange", {
          max: String(maxPriceMinor(price.currency) / 10 ** minorUnits(price.currency)),
          currency: price.currency,
        }),
      });
    }
  });

const serviceFields = {
  name: z
    .string()
    .trim()
    .min(SERVICE_NAME_MIN, "services.validation.nameRequired")
    .max(SERVICE_NAME_MAX, "services.validation.nameTooLong"),
  categoryId: z.uuid({ error: "services.validation.categoryRequired" }),
  description: z
    .string()
    .trim()
    .max(SERVICE_DESCRIPTION_MAX, "services.validation.descriptionTooLong")
    .nullish()
    .transform((value) => value || null),
  durationMinutes: z.number({ error: DURATION_MESSAGE }).refine(isValidDuration, DURATION_MESSAGE),
  // One price per currency in use, in minor units (PRD F16). The use case checks that every
  // currency in use is present (SERVICES_PRICE_REQUIRED).
  prices: z.array(priceSchema).max(CURRENCIES.length).default([]),
  color: z.enum(SERVICE_COLORS, { error: "services.validation.colorRequired" }),
  requiresRoom: z.boolean(),
  allowedRoomIds: z
    .array(z.uuid())
    .max(ALLOWED_ROOMS_MAX)
    .nullish()
    .transform((ids) => [...new Set(ids ?? [])]),
};

// A currency appears once among the prices.
const uniqueCurrencies = (service: { prices: { currency: string }[] }, ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  service.prices.forEach((price, index) => {
    if (seen.has(price.currency)) {
      ctx.addIssue({
        code: "custom",
        path: ["prices", index, "currency"],
        message: "services.validation.currencyInvalid",
      });
    }
    seen.add(price.currency);
  });
};

const baseServiceSchema = z.object(serviceFields);
export const createServiceSchema = baseServiceSchema.superRefine(uniqueCurrencies);
export const updateServiceSchema = baseServiceSchema
  .extend({
    serviceId: z.uuid(),
    version: z.number().int(),
  })
  .superRefine(uniqueCurrencies);
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
  .min(1, "services.validation.categoryNameRequired")
  .max(CATEGORY_NAME_MAX, "services.validation.categoryNameTooLong");

export const createCategorySchema = z.object({ name: categoryName });
export const renameCategorySchema = z.object({ categoryId: z.uuid(), name: categoryName });
export const moveCategorySchema = z.object({ categoryId: z.uuid(), direction: z.enum(["up", "down"]) });
export const deleteCategorySchema = z.object({ categoryId: z.uuid() });
