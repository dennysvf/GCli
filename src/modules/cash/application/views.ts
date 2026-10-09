import type { PaymentRow } from "@/modules/billing";
import type { RequestContext } from "@/shared/context/types";
import type { CashRegister } from "../domain/cash-register";
import { expectedCash, movementTotals, totalsByMethod, type MethodTotals } from "../domain/expected-cash";
import type { CashDeps, MovementRecord, StoredClosing, StoredReopening, UnitInfo } from "./ports";

// Read models of the cash register screen (spec F11 section 5). Dates travel as ISO strings.

export type RegisterView = {
  id: string;
  unitId: string;
  businessDate: string;
  currency: string;
  status: "OPEN" | "CLOSED";
  openingMinor: number;
  suggestedOpeningMinor: number;
  openingReason: string | null;
  flaggedUnclosed: boolean;
  version: number;
};

export type DayLine = {
  source: "PAYMENT" | "REFUND" | "MOVEMENT";
  id: string;
  at: string;
  // Money in (positive) or out (negative) of the register's account; cash effect is decided by method.
  amountMinor: number;
  method: string | null;
  direction: "IN" | "OUT" | null;
  description: string | null;
  categoryName: string | null;
  chargeId: string | null;
  chargeNumber: string | null;
  patientName: string | null;
  attachmentId: string | null;
  createdByName: string | null;
  reversed: boolean;
  reversalReason: string | null;
};

export type HistoryItem =
  | {
      kind: "CLOSING";
      at: string;
      byName: string | null;
      sequence: number;
      expectedMinor: number;
      countedMinor: number;
      differenceMinor: number;
      justification: string | null;
      wasFlaggedUnclosed: boolean;
    }
  | { kind: "REOPENING"; at: string; byName: string | null; reason: string };

export type RegisterDay = {
  unit: { id: string; name: string; currency: string; timeZone: string };
  businessDate: string;
  today: string;
  register: RegisterView | null;
  currency: string;
  suggestedOpeningMinor: number;
  expectedMinor: number | null;
  byMethod: MethodTotals[];
  lines: DayLine[];
  history: HistoryItem[];
  pendingUnclosed: { registerId: string; businessDate: string }[];
};

export function registerView(register: CashRegister): RegisterView {
  const s = register.snapshot;
  return {
    id: s.id,
    unitId: s.unitId,
    businessDate: s.businessDate,
    currency: s.currency,
    status: s.status,
    openingMinor: s.openingMinor,
    suggestedOpeningMinor: s.suggestedOpeningMinor,
    openingReason: s.openingReason,
    flaggedUnclosed: s.flaggedUnclosed,
    version: s.version,
  };
}

// The figures a closing stores: totals per method from the payments of the day, movement totals
// and the expected cash.
export function dayFigures(
  openingMinor: number,
  payments: readonly PaymentRow[],
  movements: readonly MovementRecord[],
) {
  const byMethod = totalsByMethod(payments);
  const movementSum = movementTotals(
    movements.map((movement) => ({
      direction: movement.direction,
      amountMinor: movement.amountMinor,
      reversed: movement.reversedAt !== null,
    })),
  );
  const expectedMinor = expectedCash({
    openingMinor,
    payments,
    movements: movements.map((movement) => ({
      direction: movement.direction,
      amountMinor: movement.amountMinor,
      reversed: movement.reversedAt !== null,
    })),
  });
  return {
    byMethod,
    expectedMinor,
    movementsInMinor: movementSum.inMinor,
    movementsOutMinor: movementSum.outMinor,
  };
}

export async function dayLines(
  deps: CashDeps,
  ctx: RequestContext,
  payments: readonly PaymentRow[],
  movements: readonly MovementRecord[],
): Promise<DayLine[]> {
  const [patientNames, userNames] = await Promise.all([
    deps.directory.patientNames(
      ctx,
      payments.map((payment) => payment.patientId),
    ),
    deps.directory.userNames(
      ctx,
      movements.map((movement) => movement.createdById),
    ),
  ]);
  const lines: DayLine[] = [
    ...payments.map((payment): DayLine => ({
      source: payment.kind,
      id: payment.id,
      at: payment.receivedAt.toISOString(),
      amountMinor: payment.amountMinor,
      method: payment.method,
      direction: null,
      description: null,
      categoryName: null,
      chargeId: payment.chargeId,
      chargeNumber: payment.chargeNumber,
      patientName: patientNames.get(payment.patientId) ?? null,
      attachmentId: null,
      createdByName: null,
      reversed: false,
      reversalReason: null,
    })),
    ...movements.map((movement): DayLine => ({
      source: "MOVEMENT",
      id: movement.id,
      at: movement.createdAt.toISOString(),
      amountMinor: movement.direction === "IN" ? movement.amountMinor : -movement.amountMinor,
      method: null,
      direction: movement.direction,
      description: movement.description,
      categoryName: movement.categoryName,
      chargeId: null,
      chargeNumber: null,
      patientName: null,
      attachmentId: movement.attachmentId,
      createdByName: userNames.get(movement.createdById) ?? null,
      reversed: movement.reversedAt !== null,
      reversalReason: movement.reversalReason,
    })),
  ];
  return lines.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export async function historyItems(
  deps: CashDeps,
  ctx: RequestContext,
  closings: readonly StoredClosing[],
  reopenings: readonly StoredReopening[],
): Promise<HistoryItem[]> {
  const names = await deps.directory.userNames(ctx, [
    ...closings.map((closing) => closing.closedById),
    ...reopenings.map((reopening) => reopening.reopenedById),
  ]);
  const items: HistoryItem[] = [
    ...closings.map((closing): HistoryItem => ({
      kind: "CLOSING",
      at: closing.closedAt.toISOString(),
      byName: names.get(closing.closedById) ?? null,
      sequence: closing.sequence,
      expectedMinor: closing.expectedMinor,
      countedMinor: closing.countedMinor,
      differenceMinor: closing.differenceMinor,
      justification: closing.justification,
      wasFlaggedUnclosed: closing.wasFlaggedUnclosed,
    })),
    ...reopenings.map((reopening): HistoryItem => ({
      kind: "REOPENING",
      at: reopening.reopenedAt.toISOString(),
      byName: names.get(reopening.reopenedById) ?? null,
      reason: reopening.reason,
    })),
  ];
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

export function unitView(unit: UnitInfo) {
  return { id: unit.id, name: unit.name, currency: unit.currency, timeZone: unit.timeZone };
}
