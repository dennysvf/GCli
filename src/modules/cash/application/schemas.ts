import { z } from "zod";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_NAME_MAX_LENGTH,
  ATTACHMENT_TYPES,
  CATEGORY_NAME_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  MAX_AMOUNT_MINOR,
  MIN_AMOUNT_MINOR,
  REASON_MAX_LENGTH,
} from "../domain/limits";

// Zod schemas of the cash and finance actions. Messages are catalog keys (cash.validation.*, ADR-028).
const id = z.uuid("cash.validation.invalidId");
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "cash.validation.invalidDate");
const money = z
  .number({ error: "cash.validation.amountRange" })
  .int("cash.validation.amountRange")
  .min(MIN_AMOUNT_MINOR, "cash.validation.amountRange")
  .max(MAX_AMOUNT_MINOR, "cash.validation.amountRange");
const balance = z
  .number({ error: "cash.validation.balanceRange" })
  .int("cash.validation.balanceRange")
  .min(0, "cash.validation.balanceRange")
  .max(MAX_AMOUNT_MINOR, "cash.validation.balanceRange");
const description = z
  .string({ error: "cash.validation.descriptionRequired" })
  .trim()
  .min(DESCRIPTION_MIN_LENGTH, "cash.validation.descriptionRequired")
  .max(DESCRIPTION_MAX_LENGTH, "cash.validation.descriptionTooLong");
const reason = z
  .string({ error: "cash.validation.reasonRequired" })
  .trim()
  .max(REASON_MAX_LENGTH, "cash.validation.reasonTooLong");
const optionalReason = reason.nullish().transform((value) => value ?? null);
const currency = z.string().regex(/^[A-Z]{3}$/, "cash.validation.invalidCurrency");
const kind = z.enum(["EXPENSE", "REVENUE"]);

export const openRegisterSchema = z.object({
  unitId: id,
  businessDate: calendarDate,
  openingMinor: balance,
  openingReason: optionalReason,
});

export const registerIdSchema = z.object({ registerId: id });

export const registerDaySchema = z.object({ unitId: id, businessDate: calendarDate });

export const recordMovementSchema = z.object({
  registerId: id,
  direction: z.enum(["IN", "OUT"]),
  amountMinor: money,
  description,
  categoryId: id,
  attachmentId: id.nullish().transform((value) => value ?? null),
});

export const reverseMovementSchema = z.object({ movementId: id, reason });

export const closeRegisterSchema = z.object({
  registerId: id,
  countedMinor: balance,
  justification: optionalReason,
});

export const reopenRegisterSchema = z.object({ registerId: id, reason });

const paid = z
  .object({
    paidOn: calendarDate,
    method: z.string().min(1).max(20),
  })
  .nullish()
  .transform((value) => value ?? null);

export const createEntrySchema = z.object({
  kind,
  description,
  categoryId: id,
  unitId: id.nullish().transform((value) => value ?? null),
  currency,
  amountMinor: money,
  dueDate: calendarDate,
  repeatMonthly: z.boolean().optional().default(false),
  attachmentId: id.nullish().transform((value) => value ?? null),
  paid,
});

export const updateEntrySchema = z.object({
  entryId: id,
  version: z.number().int().min(1).optional(),
  scope: z.enum(["ONE", "FOLLOWING"]).default("ONE"),
  description,
  categoryId: id,
  unitId: id.nullish().transform((value) => value ?? null),
  currency,
  amountMinor: money,
  dueDate: calendarDate,
  attachmentId: id.nullish().transform((value) => value ?? null),
});

export const deleteEntrySchema = z.object({
  entryId: id,
  scope: z.enum(["ONE", "FOLLOWING"]).default("ONE"),
});

export const payEntrySchema = z.object({
  entryId: id,
  paidOn: calendarDate,
  method: z.string().min(1).max(20),
});

export const reverseEntryPaymentSchema = z.object({ entryId: id, reason });

export const endSeriesSchema = z.object({ seriesId: id });

export const listEntriesSchema = z.object({
  kind,
  from: calendarDate.nullish().transform((value) => value ?? null),
  to: calendarDate.nullish().transform((value) => value ?? null),
  categoryId: id.nullish().transform((value) => value ?? null),
  unit: z.union([z.literal("ALL"), z.literal("GENERAL"), id]).default("ALL"),
  status: z
    .enum(["PENDING", "PAID", "OVERDUE"])
    .nullish()
    .transform((value) => value ?? null),
});

export const statementSchema = z.object({
  unit: z.union([z.literal("ALL"), z.literal("GENERAL"), id]),
  from: calendarDate,
  to: calendarDate,
  currency: currency.nullish().transform((value) => value ?? null),
});

export const saveCategorySchema = z.object({
  categoryId: id.optional(),
  kind: z.enum(["EXPENSE", "REVENUE"]),
  name: z
    .string({ error: "cash.validation.nameRequired" })
    .trim()
    .min(1, "cash.validation.nameRequired")
    .max(CATEGORY_NAME_MAX_LENGTH, "cash.validation.nameTooLong"),
});

export const setCategoryActiveSchema = z.object({ categoryId: id, active: z.boolean() });

export const attachmentIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(ATTACHMENT_NAME_MAX_LENGTH),
  contentType: z.enum(ATTACHMENT_TYPES, { error: "cash.validation.attachmentInvalid" }),
  sizeBytes: z
    .number()
    .int()
    .min(1, "cash.validation.attachmentInvalid")
    .max(ATTACHMENT_MAX_BYTES, "cash.validation.attachmentInvalid"),
});

export const attachmentIdSchema = z.object({ attachmentId: id });
