import { z } from "zod";
import {
  MAX_PRICE_MINOR,
  MAX_SESSIONS,
  MAX_VALIDITY_DAYS,
  MIN_PRICE_MINOR,
  MIN_SESSIONS,
  MIN_VALIDITY_DAYS,
  NAME_MAX_LENGTH,
  REASON_MAX_LENGTH,
} from "../domain/limits";

// Zod schemas of the package actions. Messages are catalog keys (packages.validation.*, ADR-028).
const id = z.uuid("packages.validation.invalidId");
const version = z.number().int().min(1);
const reason = z
  .string({ error: "packages.validation.reasonRequired" })
  .trim()
  .max(REASON_MAX_LENGTH, "packages.validation.reasonTooLong");
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "packages.validation.invalidDate");

export const saveTemplateSchema = z.object({
  templateId: id.optional(),
  version: version.optional(),
  name: z
    .string({ error: "packages.validation.nameRequired" })
    .trim()
    .min(1, "packages.validation.nameRequired")
    .max(NAME_MAX_LENGTH, "packages.validation.nameTooLong"),
  serviceId: id,
  sessions: z
    .number({ error: "packages.validation.sessionsRange" })
    .int("packages.validation.sessionsRange")
    .min(MIN_SESSIONS, "packages.validation.sessionsRange")
    .max(MAX_SESSIONS, "packages.validation.sessionsRange"),
  validityDays: z
    .number({ error: "packages.validation.validityRange" })
    .int("packages.validation.validityRange")
    .min(MIN_VALIDITY_DAYS, "packages.validation.validityRange")
    .max(MAX_VALIDITY_DAYS, "packages.validation.validityRange"),
  prices: z
    .array(
      z.object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        amountMinor: z
          .number({ error: "packages.validation.priceRange" })
          .int("packages.validation.priceRange")
          .min(MIN_PRICE_MINOR, "packages.validation.priceRange")
          .max(MAX_PRICE_MINOR, "packages.validation.priceRange"),
      }),
    )
    .min(1, "packages.validation.priceRequired")
    .max(10),
  active: z.boolean().default(true),
});

export const listTemplatesSchema = z.object({ includeInactive: z.boolean().optional() });
export const setTemplateActiveSchema = z.object({ templateId: id, version, active: z.boolean() });

export const sellSchema = z.object({
  patientId: id,
  templateId: id,
  unitId: id,
  priceMinor: z.number().int().min(MIN_PRICE_MINOR).max(MAX_PRICE_MINOR),
  discountReason: reason.optional(),
  approval: z
    .object({ approverUserId: id, pin: z.string().regex(/^\d{6}$/, "packages.validation.pinFormat") })
    .optional(),
  submitForApproval: z.boolean().optional(),
});

export const extendSchema = z.object({
  packageId: id,
  version: version.optional(),
  days: z.number().int().min(1).max(365),
  reason,
});
export const cancelSchema = z.object({
  packageId: id,
  version: version.optional(),
  reason,
  confirmUnlink: z.boolean().optional(),
});

export const eligibleSchema = z.object({ patientId: id, serviceId: id, date: calendarDate });
export const coverageSchema = z.object({ packageId: id, count: z.number().int().min(1).max(100) });
export const patientPackagesSchema = z.object({ patientId: id });
export const setNoShowSchema = z.object({ enabled: z.boolean() });
