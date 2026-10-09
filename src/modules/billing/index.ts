// Public API of the billing module (spec F09 section 5). Use cases are wired here with their
// infrastructure adapters; callers never import files inside the module.
import { identity } from "@/modules/identity";
import { units } from "@/modules/units";
import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { EventBus } from "@/shared/events/event-bus";
import { newId } from "@/shared/kernel/ids";
import { definePort } from "@/shared/ports/registry";
import { subscribeBillingEvents as subscribe } from "./application/appointment-handlers";
import { createManualCharge, createPackageCharge, createPackageChargeIn } from "./application/charges";
import {
  approveDiscount,
  countPendingApprovals,
  listPendingApprovals,
  rejectDiscount,
  setDiscount,
  setDiscountIn,
  verifyApproval,
} from "./application/discounts";
import { listPaymentMethodSettings, setPaymentMethodEnabled } from "./application/payment-methods";
import { receivePayment, refundPayment, voidCharge, voidChargeIn } from "./application/payments";
import type {
  BillingDeps,
  CashRegisterGate,
  ChargeExemptionPolicy,
  PaymentWindow,
} from "./application/ports";
import {
  getAppointmentCharge,
  getCharge,
  getChargeStatus,
  getNewChargeOptions,
  getReceiveOptions,
  listCharges,
  listPaymentsForCash,
  listPatientCharges,
} from "./application/queries";
import { renderReceipt } from "./application/receipt";
import { billingDirectory } from "./infrastructure/directory";
import { noExemptions } from "./infrastructure/no-exemptions";
import { openCashRegister } from "./infrastructure/open-cash-register";
import { prismaChargeReads } from "./infrastructure/prisma-charge-reads";
import { prismaChargeRepository } from "./infrastructure/prisma-charge-repository";
import { reactPdfReceiptRenderer } from "./infrastructure/receipt-renderer";

// Extension points (ADR-007, ADR-022): packages (F10) exempt appointments, the cash register
// (F11) closes days. Until they register, nothing is exempt and every day is open.
const chargeExemptionPolicy = definePort<ChargeExemptionPolicy>(
  "billing.ChargeExemptionPolicy",
  noExemptions,
);
const cashRegisterGate = definePort<CashRegisterGate>("billing.CashRegisterGate", openCashRegister);

const baseDeps: BillingDeps = {
  charges: prismaChargeRepository,
  reads: prismaChargeReads,
  directory: billingDirectory,
  approvals: {
    async verify(ctx, approverUserId, pin) {
      const verified = await identity.verifyApprovalPin(ctx, approverUserId, pin);
      return verified.ok ? { ok: true, value: { approverUserId } } : verified;
    },
  },
  exemptions: () => chargeExemptionPolicy.get(),
  cashRegister: () => cashRegisterGate.get(),
  receipts: reactPdfReceiptRenderer,
  clock: () => new Date(),
  newId,
};

// The use cases bound to their dependencies. `adjust` lets tests replace an adapter (a clock, a
// receipt renderer that fails) while the rest stays real.
export function createBilling(adjust?: (base: BillingDeps) => BillingDeps) {
  const deps = adjust ? adjust(baseDeps) : baseDeps;
  return {
    // Charges
    createManualCharge: (ctx: RequestContext, input: unknown) => createManualCharge(deps, ctx, input),
    // For F10: the charge of a package sale.
    createPackageCharge: (ctx: RequestContext, input: unknown) => createPackageCharge(deps, ctx, input),
    getChargeStatus: (ctx: RequestContext, chargeId: string) => getChargeStatus(deps, ctx, chargeId),
    // In the caller's transaction (F10: sale and cancellation of a package).
    createPackageChargeIn: (ctx: RequestContext, uow: UnitOfWork, input: unknown) =>
      createPackageChargeIn(deps, ctx, uow, input),
    setDiscountIn: (ctx: RequestContext, uow: UnitOfWork, input: Parameters<typeof setDiscountIn>[3]) =>
      setDiscountIn(deps, ctx, uow, input),
    voidChargeIn: (ctx: RequestContext, uow: UnitOfWork, input: { chargeId: string; reason: string }) =>
      voidChargeIn(deps, ctx, uow, input),
    verifyApproval: (ctx: RequestContext, approverUserId: string, pin: string) =>
      verifyApproval(deps, ctx, approverUserId, pin),
    // Discounts and approvals
    setDiscount: (ctx: RequestContext, input: unknown) => setDiscount(deps, ctx, input),
    approveDiscount: (ctx: RequestContext, input: unknown) => approveDiscount(deps, ctx, input),
    rejectDiscount: (ctx: RequestContext, input: unknown) => rejectDiscount(deps, ctx, input),
    listPendingApprovals: (ctx: RequestContext) => listPendingApprovals(deps, ctx),
    countPendingApprovals: (ctx: RequestContext) => countPendingApprovals(deps, ctx),
    // Payments
    receivePayment: (ctx: RequestContext, input: unknown) => receivePayment(deps, ctx, input),
    refundPayment: (ctx: RequestContext, input: unknown) => refundPayment(deps, ctx, input),
    voidCharge: (ctx: RequestContext, input: unknown) => voidCharge(deps, ctx, input),
    // Reads
    getAppointmentCharge: (ctx: RequestContext, appointmentId: string) =>
      getAppointmentCharge(deps, ctx, appointmentId),
    getCharge: (ctx: RequestContext, input: unknown) => getCharge(deps, ctx, input),
    listCharges: (ctx: RequestContext, input?: unknown) => listCharges(deps, ctx, input),
    listPatientCharges: (ctx: RequestContext, patientId: string) => listPatientCharges(deps, ctx, patientId),
    getReceiveOptions: (ctx: RequestContext, input: unknown) => getReceiveOptions(deps, ctx, input),
    getNewChargeOptions: (ctx: RequestContext) => getNewChargeOptions(deps, ctx),
    renderReceipt: (ctx: RequestContext, input: unknown) => renderReceipt(deps, ctx, input),
    // For the cash register (F11): payments and refunds of a window.
    listPaymentsForCash: (ctx: RequestContext, filter: PaymentWindow) =>
      listPaymentsForCash(deps, ctx, filter),
    // Whether billing has records in the unit; the cash register combines it with its own.
    hasUnitFinancialRecords: (organizationId: string, unitId: string) =>
      prismaChargeReads.hasAnyInUnit(organizationId, unitId),
    // Settings
    listPaymentMethodSettings: (ctx: RequestContext) => listPaymentMethodSettings(deps, ctx),
    setPaymentMethodEnabled: (ctx: RequestContext, input: unknown) =>
      setPaymentMethodEnabled(deps, ctx, input),
    // Extension points; null restores the default.
    registerChargeExemptionPolicy: (implementation: ChargeExemptionPolicy | null) => {
      chargeExemptionPolicy.register(implementation);
    },
    registerCashRegisterGate: (implementation: CashRegisterGate | null) => {
      cashRegisterGate.register(implementation);
    },
  };
}

export const billing = createBilling();

// Wired by the composition root: the scheduling events and the country lock of units.
export function subscribeBillingEvents(bus: EventBus<UnitOfWork>): void {
  subscribe(bus, baseDeps);
}

export function registerBillingPorts(): void {
  units.registerUnitFinancialRecords({
    hasAnyInUnit: (organizationId, unitId) => prismaChargeReads.hasAnyInUnit(organizationId, unitId),
  });
}

export { billingCatalog } from "./messages/catalog";
export {
  ApprovalsTable,
  BillingTab,
  ChargeDetailView,
  ChargeSection,
  ChargesList,
  PaymentMethodsPanel,
  ReceiveDialog,
} from "./client";
export type { BillingActions, ReceiveInput } from "./client";

export { BILLING_EVENTS, type ChargeEventPayload, type PaymentEventPayload } from "./domain/events";
export type { DiscountOutcome, PendingApproval } from "./application/discounts";
export type { PaymentMethodSetting } from "./application/payment-methods";
export type { ReceiveResult } from "./application/payments";
export type {
  ChargeDetail,
  ChargeList,
  NewChargeOptions,
  PatientCharges,
  ReceiveOptions,
} from "./application/queries";
export type { ReceiptFile } from "./application/receipt";
export type {
  BillingDeps,
  CashRegisterGate,
  ChargeExemptionPolicy,
  PaymentRow,
  PaymentWindow,
} from "./application/ports";
export type { ChargeView, DiscountRequestView, PaymentView } from "./application/views";
export type { ChargeStatus } from "./domain/status";
