import { billing } from "@/modules/billing";
import type { BillingGateway } from "../application/ports";

// Payments and refunds are read from billing, never copied (ADR-036).
export const billingGateway: BillingGateway = {
  payments: (ctx, filter) => billing.listPaymentsForCash(ctx, filter),
};
