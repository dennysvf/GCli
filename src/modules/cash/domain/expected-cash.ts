import { CASH_METHOD } from "./limits";

// A payment or a refund as billing reports it: refunds carry a negative amount (ADR-036).
export type PaymentLine = { kind: "PAYMENT" | "REFUND"; method: string; amountMinor: number };

export type MovementLine = { direction: "IN" | "OUT"; amountMinor: number; reversed: boolean };

export type MethodTotals = {
  method: string;
  receivedMinor: number;
  refundedMinor: number;
  netMinor: number;
};

// Received, refunded (as a positive amount) and net per method, in a stable order: cash first, then
// by method code.
export function totalsByMethod(lines: readonly PaymentLine[]): MethodTotals[] {
  const byMethod = new Map<string, MethodTotals>();
  for (const line of lines) {
    const total = byMethod.get(line.method) ?? {
      method: line.method,
      receivedMinor: 0,
      refundedMinor: 0,
      netMinor: 0,
    };
    if (line.kind === "REFUND") total.refundedMinor += Math.abs(line.amountMinor);
    else total.receivedMinor += line.amountMinor;
    total.netMinor = total.receivedMinor - total.refundedMinor;
    byMethod.set(line.method, total);
  }
  return [...byMethod.values()].sort((a, b) =>
    a.method === CASH_METHOD ? -1 : b.method === CASH_METHOD ? 1 : a.method.localeCompare(b.method),
  );
}

export function movementTotals(movements: readonly MovementLine[]): { inMinor: number; outMinor: number } {
  let inMinor = 0;
  let outMinor = 0;
  for (const movement of movements) {
    if (movement.reversed) continue;
    if (movement.direction === "IN") inMinor += movement.amountMinor;
    else outMinor += movement.amountMinor;
  }
  return { inMinor, outMinor };
}

// PRD F11: expected cash = opening + cash payments − cash refunds + manual entries − manual
// withdrawals. Only the cash method moves the drawer; reversed movements do not count.
export function expectedCash(input: {
  openingMinor: number;
  payments: readonly PaymentLine[];
  movements: readonly MovementLine[];
}): number {
  const cashNet = input.payments
    .filter((line) => line.method === CASH_METHOD)
    .reduce((sum, line) => sum + line.amountMinor, 0);
  const { inMinor, outMinor } = movementTotals(input.movements);
  return input.openingMinor + cashNet + inMinor - outMinor;
}
