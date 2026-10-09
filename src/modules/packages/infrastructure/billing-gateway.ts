import { billing } from "@/modules/billing";
import type { BillingGateway } from "../application/ports";

// Billing (F09) calls that run inside the sale transaction (spec F10 section 3).
export const billingGateway: BillingGateway = {
  createCharge: (ctx, uow, input) =>
    billing.createPackageChargeIn(ctx, uow, {
      patientId: input.patientId,
      unitId: input.unitId,
      packageId: input.packageId,
      serviceId: input.serviceId,
      grossMinor: input.grossMinor,
    }),

  setDiscount: (ctx, uow, input) =>
    billing.setDiscountIn(ctx, uow, {
      chargeId: input.chargeId,
      discount: { kind: "AMOUNT", value: input.discountMinor },
      reason: input.reason,
      approverUserId: input.approverUserId,
      submitForApproval: input.submitForApproval,
    }),

  voidCharge: (ctx, uow, input) => billing.voidChargeIn(ctx, uow, input),

  verifyApproval: (ctx, approverUserId, pin) => billing.verifyApproval(ctx, approverUserId, pin),

  async chargeStatuses(ctx, chargeIds) {
    const statuses = new Map<string, string>();
    for (const chargeId of chargeIds) {
      const status = await billing.getChargeStatus(ctx, chargeId);
      if (status.ok) statuses.set(chargeId, status.value.status);
    }
    return statuses;
  },
};
