// Domain events of the cash module (architecture 5.4). They are published inside the transaction;
// payloads hold IDs and amounts, never personal data.
export type CashEvent = { type: string; occurredAt: Date; payload: Record<string, unknown> };

export const CASH_EVENTS = {
  registerOpened: "CashRegisterOpened",
  registerClosed: "CashRegisterClosed",
  registerReopened: "CashRegisterReopened",
  movementRecorded: "CashMovementRecorded",
  movementReversed: "CashMovementReversed",
  entryCreated: "FinancialEntryCreated",
  entryPaid: "FinancialEntryPaid",
  entryPaymentReversed: "FinancialEntryPaymentReversed",
  entryDeleted: "FinancialEntryDeleted",
} as const;

export type CashRegisterEventPayload = {
  registerId: string;
  unitId: string;
  businessDate: string;
  currency: string;
  actorUserId: string | null;
  expectedMinor?: number;
  countedMinor?: number;
  differenceMinor?: number;
};

export type CashMovementEventPayload = {
  movementId: string;
  registerId: string;
  unitId: string;
  direction: "IN" | "OUT";
  amountMinor: number;
  currency: string;
  actorUserId: string | null;
};

export type FinancialEntryEventPayload = {
  entryId: string;
  kind: "EXPENSE" | "REVENUE";
  unitId: string | null;
  currency: string;
  amountMinor: number;
  actorUserId: string | null;
};

export function cashEvent(type: string, payload: Record<string, unknown>, now: Date): CashEvent {
  return { type, occurredAt: now, payload: { ...payload } };
}
