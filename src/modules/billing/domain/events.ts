// Domain events of the billing module (architecture 5.4). They are published inside the
// transaction, so F11 (cash register movements) commits or rolls back with the payment. Payloads
// hold IDs, minor amounts, currency and method, never personal data.
export type BillingEvent = { type: string; occurredAt: Date; payload: Record<string, unknown> };

export const BILLING_EVENTS = {
  chargeCreated: "ChargeCreated",
  chargeDeleted: "ChargeDeleted",
  discountRequested: "ChargeDiscountRequested",
  discountApproved: "ChargeDiscountApproved",
  discountRejected: "ChargeDiscountRejected",
  chargeVoided: "ChargeVoided",
  paymentRegistered: "PaymentRegistered",
  paymentRefunded: "PaymentRefunded",
} as const;

export type ChargeEventPayload = {
  chargeId: string;
  number: string;
  patientId: string;
  origin: string;
  appointmentId: string | null;
  unitId: string;
  currency: string;
  grossMinor: number;
  netMinor: number;
  actorUserId: string;
};

export type PaymentEventPayload = {
  chargeId: string;
  paymentId: string;
  patientId: string;
  unitId: string;
  method: string;
  // Negative for refunds.
  amountMinor: number;
  currency: string;
  receivedAt: string;
  actorUserId: string;
};

export function billingEvent(type: string, payload: object, now: Date): BillingEvent {
  return { type, occurredAt: now, payload: { ...payload } };
}
