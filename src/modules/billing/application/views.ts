import type { RequestContext } from "@/shared/context/types";
import type { Charge, ChargeProps, DiscountRequestRecord, PaymentRecord } from "../domain/charge";
import type { ChargeStatus } from "../domain/status";
import type { BillingDirectory } from "./ports";

// Shapes the screens and Server Actions receive (dates as ISO strings, amounts in minor units).
export type PaymentView = {
  id: string;
  kind: "PAYMENT" | "REFUND";
  method: string;
  installments: number | null;
  amountMinor: number;
  refundedMinor: number;
  unitId: string;
  unitName: string;
  receivedAt: string;
  userName: string;
  reason: string | null;
  refundedPaymentId: string | null;
};

export type DiscountRequestView = {
  id: string;
  kind: "PERCENT" | "AMOUNT";
  value: number;
  discountMinor: number;
  reason: string | null;
  status: DiscountRequestRecord["status"];
  method: DiscountRequestRecord["method"];
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
};

export type ChargeView = {
  id: string;
  number: string;
  status: ChargeStatus;
  origin: ChargeProps["origin"];
  patientId: string;
  patientName: string;
  appointmentId: string | null;
  itemName: string;
  professionalId: string | null;
  professionalName: string | null;
  unitId: string;
  unitName: string;
  currency: string;
  grossMinor: number;
  discount: { kind: "PERCENT" | "AMOUNT"; value: number } | null;
  discountMinor: number;
  discountReason: string | null;
  netMinor: number;
  paidMinor: number;
  balanceMinor: number;
  version: number;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  pendingRequest: DiscountRequestView | null;
  payments: PaymentView[];
};

export type NameTables = {
  patients: Map<string, string>;
  services: Map<string, string>;
  professionals: Map<string, string>;
  users: Map<string, string>;
  units: Map<string, string>;
};

export async function loadNames(
  directory: BillingDirectory,
  ctx: RequestContext,
  charges: Pick<
    ChargeProps,
    "patientId" | "serviceId" | "professionalId" | "unitId" | "payments" | "pendingRequest" | "cancelledById"
  >[],
): Promise<NameTables> {
  const ids = {
    patients: new Set<string>(),
    services: new Set<string>(),
    professionals: new Set<string>(),
    users: new Set<string>(),
    units: new Set<string>(),
  };
  for (const charge of charges) {
    ids.patients.add(charge.patientId);
    if (charge.serviceId) ids.services.add(charge.serviceId);
    if (charge.professionalId) ids.professionals.add(charge.professionalId);
    ids.units.add(charge.unitId);
    if (charge.cancelledById) ids.users.add(charge.cancelledById);
    for (const payment of charge.payments) {
      ids.users.add(payment.userId);
      ids.units.add(payment.unitId);
    }
    if (charge.pendingRequest) {
      ids.users.add(charge.pendingRequest.requestedById);
      if (charge.pendingRequest.decidedById) ids.users.add(charge.pendingRequest.decidedById);
    }
  }
  const [patients, services, professionals, users, units] = await Promise.all([
    directory.patientNames(ctx, [...ids.patients]),
    directory.serviceNames(ctx, [...ids.services]),
    directory.professionalNames(ctx, [...ids.professionals]),
    directory.userNames(ctx, [...ids.users]),
    directory.activeUnits(ctx).then(async (active) => {
      const names = new Map(active.map((unit) => [unit.id, unit.name]));
      for (const id of ids.units) {
        if (names.has(id)) continue;
        const unit = await directory.unit(ctx, id);
        if (unit) names.set(id, unit.name);
      }
      return names;
    }),
  ]);
  return { patients, services, professionals, users, units };
}

function paymentView(payment: PaymentRecord, names: NameTables): PaymentView {
  return {
    id: payment.id,
    kind: payment.kind,
    method: payment.method,
    installments: payment.installments,
    amountMinor: payment.amountMinor,
    refundedMinor: payment.refundedMinor,
    unitId: payment.unitId,
    unitName: names.units.get(payment.unitId) ?? "",
    receivedAt: payment.receivedAt.toISOString(),
    userName: names.users.get(payment.userId) ?? "",
    reason: payment.reason,
    refundedPaymentId: payment.refundedPaymentId,
  };
}

export function requestView(request: DiscountRequestRecord, names: NameTables): DiscountRequestView {
  return {
    id: request.id,
    kind: request.kind,
    value: request.value,
    discountMinor: request.discountMinor,
    reason: request.reason,
    status: request.status,
    method: request.method,
    requestedByName: names.users.get(request.requestedById) ?? "",
    requestedAt: request.requestedAt.toISOString(),
    decidedByName: request.decidedById ? (names.users.get(request.decidedById) ?? "") : null,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    rejectionReason: request.rejectionReason,
  };
}

export function chargeView(charge: Charge | Readonly<ChargeProps>, names: NameTables): ChargeView {
  const s: Readonly<ChargeProps> = "snapshot" in charge ? charge.snapshot : charge;
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    origin: s.origin,
    patientId: s.patientId,
    patientName: names.patients.get(s.patientId) ?? "",
    appointmentId: s.appointmentId,
    itemName: (s.serviceId ? names.services.get(s.serviceId) : null) ?? s.description ?? "",
    professionalId: s.professionalId,
    professionalName: s.professionalId ? (names.professionals.get(s.professionalId) ?? null) : null,
    unitId: s.unitId,
    unitName: names.units.get(s.unitId) ?? "",
    currency: s.currency,
    grossMinor: s.grossMinor,
    discount: s.discount,
    discountMinor: s.discountMinor,
    discountReason: s.discountReason,
    netMinor: s.netMinor,
    paidMinor: s.paidMinor,
    balanceMinor: s.netMinor - s.paidMinor,
    version: s.version,
    createdAt: s.createdAt.toISOString(),
    cancelledAt: s.cancelledAt?.toISOString() ?? null,
    cancelReason: s.cancelReason,
    pendingRequest: s.pendingRequest ? requestView(s.pendingRequest, names) : null,
    payments: s.payments.map((payment) => paymentView(payment, names)),
  };
}

// The view of a charge the use case just changed, with names resolved after the transaction.
export async function viewOf(
  directory: BillingDirectory,
  ctx: RequestContext,
  charge: Charge,
): Promise<ChargeView> {
  const names = await loadNames(directory, ctx, [charge.snapshot]);
  return chargeView(charge, names);
}
