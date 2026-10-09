"use server";

import { billing } from "@/modules/billing";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of billing (spec F09 section 5). Each one only translates the result:
// authorization, validation, audit and events live in the use cases.
export async function appointmentChargeAction(input: { appointmentId: string }) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.getAppointmentCharge(ctx, input.appointmentId), ctx.locale, "billing"),
  );
}

export async function receiveOptionsAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.getReceiveOptions(ctx, input), ctx.locale, "billing"),
  );
}

export async function receivePaymentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.receivePayment(ctx, input), ctx.locale, "billing"),
  );
}

export async function setDiscountAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.setDiscount(ctx, input), ctx.locale, "billing"),
  );
}

export async function createChargeAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.createManualCharge(ctx, input), ctx.locale, "billing"),
  );
}

export async function listChargesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.listCharges(ctx, input), ctx.locale, "billing"),
  );
}

export async function patientChargesAction(input: { patientId: string }) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.listPatientCharges(ctx, input.patientId), ctx.locale, "billing"),
  );
}

export async function chargeDetailAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.getCharge(ctx, input), ctx.locale, "billing"),
  );
}

export async function approveDiscountAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.approveDiscount(ctx, input), ctx.locale, "billing"),
  );
}

export async function rejectDiscountAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.rejectDiscount(ctx, input), ctx.locale, "billing"),
  );
}

export async function refundPaymentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.refundPayment(ctx, input), ctx.locale, "billing"),
  );
}

export async function voidChargeAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.voidCharge(ctx, input), ctx.locale, "billing"),
  );
}

export async function pendingApprovalsAction() {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.listPendingApprovals(ctx), ctx.locale, "billing"),
  );
}

export async function setPaymentMethodAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.setPaymentMethodEnabled(ctx, input), ctx.locale, "billing"),
  );
}

export async function newChargeOptionsAction() {
  return withRequestContext(async (ctx) =>
    toActionResult(await billing.getNewChargeOptions(ctx), ctx.locale, "billing"),
  );
}
