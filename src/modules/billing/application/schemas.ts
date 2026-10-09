import { z } from "zod";
import { COUNTRY_CODES } from "@/shared/kernel/countries/codes";
import { DESCRIPTION_MAX_LENGTH, MAX_PAYMENT_LINES, REASON_MAX_LENGTH } from "../domain/limits";
import { CHARGE_STATUSES } from "../domain/status";

// Zod schemas of the billing actions. Messages are catalog keys (billing.validation.*, ADR-028).
const id = z.uuid("billing.validation.invalidId");
const version = z.number().int().min(1);
const reason = z
  .string({ error: "billing.validation.reasonRequired" })
  .trim()
  .max(REASON_MAX_LENGTH, "billing.validation.reasonTooLong");
const optionalReason = reason.optional();
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "billing.validation.invalidDate");

export const discountSchema = z.object({
  kind: z.enum(["PERCENT", "AMOUNT"]),
  value: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});

const approvalSchema = z.object({
  approverUserId: id,
  pin: z.string().regex(/^\d{6}$/, "billing.validation.pinFormat"),
});

export const chargeIdSchema = z.object({ chargeId: id });

export const setDiscountSchema = z.object({
  chargeId: id,
  version,
  discount: discountSchema.nullable(),
  reason: optionalReason,
  approval: approvalSchema.optional(),
  submitForApproval: z.boolean().optional(),
});

export const decideDiscountSchema = z.object({ chargeId: id, version: version.optional() });
export const rejectDiscountSchema = decideDiscountSchema.extend({ reason });

export const paymentLineSchema = z.object({
  method: z.string().min(1).max(20),
  amountMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  installments: z.number().int().min(1).max(100).optional(),
});

export const receivePaymentSchema = z.object({
  chargeId: id,
  // Only checked together with a discount change: the balance check under lock guards the money.
  version: version.optional(),
  submissionKey: id,
  unitId: id,
  discount: discountSchema.nullable().optional(),
  discountReason: optionalReason,
  approval: approvalSchema.optional(),
  receivedAt: z.iso.datetime().optional(),
  payments: z.array(paymentLineSchema).min(1).max(MAX_PAYMENT_LINES),
});

export const createChargeSchema = z
  .object({
    patientId: id,
    unitId: id,
    serviceId: id.optional(),
    description: z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH).optional(),
    grossMinor: z.number().int().min(1).max(999_999_999),
    professionalId: id.optional(),
  })
  .refine((data) => data.serviceId || data.description, {
    path: ["description"],
    message: "billing.validation.itemRequired",
  });

export const createPackageChargeSchema = z.object({
  patientId: id,
  unitId: id,
  packageId: id,
  serviceId: id.optional(),
  description: z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH).optional(),
  grossMinor: z.number().int().min(1).max(999_999_999),
  professionalId: id.optional(),
});

export const refundSchema = z.object({
  chargeId: id,
  paymentId: id,
  version: version.optional(),
  amountMinor: z.number().int().min(1).optional(),
  reason,
  unitId: id,
});

export const voidSchema = z.object({ chargeId: id, version: version.optional(), reason });

export const listChargesSchema = z.object({
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  unitId: id.optional(),
  statuses: z.array(z.enum(CHARGE_STATUSES)).max(5).optional(),
  professionalId: id.optional(),
  method: z.string().min(1).max(20).optional(),
  patientId: id.optional(),
  cursor: z.string().max(100).optional(),
});

export const paymentMethodSchema = z.object({
  country: z.enum(COUNTRY_CODES),
  method: z.string().min(1).max(20),
  enabled: z.boolean(),
});
