import { describe, expect, it } from "vitest";
import { CashRegister, checkOpenDate } from "./cash-register";
import { expectedCash, totalsByMethod } from "./expected-cash";
import { FinancialEntry } from "./financial-entry";
import { occurrenceDueDate, occurrencesToAdd } from "./recurrence";
import { buildStatement } from "./statement";

const NOW = new Date("2026-10-09T15:00:00Z");

function openRegister(opening = 20_000, suggested = 20_000, reason: string | null = null) {
  const opened = CashRegister.open({
    id: "r1",
    organizationId: "o1",
    unitId: "u1",
    businessDate: "2026-10-09",
    currency: "BRL",
    openingMinor: opening,
    suggestedOpeningMinor: suggested,
    openingReason: reason,
    openedById: "user",
    now: NOW,
  });
  if (!opened.ok) throw new Error(opened.error.code);
  return opened.value;
}

const closeInput = (counted: number, justification: string | null, expected = 43_000) => ({
  closingId: "c1",
  nextSequence: 1,
  expectedMinor: expected,
  countedMinor: counted,
  justification,
  byMethod: [],
  movementsInMinor: 0,
  movementsOutMinor: 0,
  userId: "user",
  now: NOW,
  formatAmount: (minor: number) => `R$ ${minor / 100}`,
});

describe("expected cash", () => {
  it("F11: expected cash is opening + cash payments − cash refunds + entries − withdrawals", () => {
    const expected = expectedCash({
      openingMinor: 20_000,
      payments: [
        { kind: "PAYMENT", method: "CASH", amountMinor: 25_000 },
        { kind: "REFUND", method: "CASH", amountMinor: -2_000 },
        { kind: "PAYMENT", method: "PIX", amountMinor: 30_000 },
      ],
      movements: [
        { direction: "IN", amountMinor: 1_000, reversed: false },
        { direction: "OUT", amountMinor: 4_590, reversed: false },
      ],
    });
    // 20000 + 25000 − 2000 + 1000 − 4590; the PIX payment never touches the drawer.
    expect(expected).toBe(39_410);
  });

  it("F11: reversed movements do not count and transfers (plain movements) do", () => {
    const expected = expectedCash({
      openingMinor: 0,
      payments: [],
      movements: [
        { direction: "OUT", amountMinor: 5_000, reversed: true },
        { direction: "OUT", amountMinor: 3_000, reversed: false },
      ],
    });
    expect(expected).toBe(-3_000);
  });

  it("F11: totals per method put cash first and net out refunds", () => {
    const totals = totalsByMethod([
      { kind: "PAYMENT", method: "PIX", amountMinor: 30_000 },
      { kind: "PAYMENT", method: "CASH", amountMinor: 25_000 },
      { kind: "REFUND", method: "CASH", amountMinor: -2_000 },
    ]);
    expect(totals.map((total) => total.method)).toEqual(["CASH", "PIX"]);
    expect(totals[0]).toEqual({
      method: "CASH",
      receivedMinor: 25_000,
      refundedMinor: 2_000,
      netMinor: 23_000,
    });
  });
});

describe("cash register", () => {
  it("F11: a changed opening balance needs a reason of at least 10 characters", () => {
    const refused = CashRegister.open({
      id: "r",
      organizationId: "o",
      unitId: "u",
      businessDate: "2026-10-09",
      currency: "BRL",
      openingMinor: 15_000,
      suggestedOpeningMinor: 20_000,
      openingReason: "curto",
      openedById: "user",
      now: NOW,
    });
    expect(!refused.ok && refused.error.code).toBe("CASH_OPENING_REASON_REQUIRED");
    expect(openRegister(15_000, 20_000, "Troco deixado no cofre").snapshot.openingReason).toBe(
      "Troco deixado no cofre",
    );
  });

  it("F11: a difference needs a justification of at least 10 characters", () => {
    const register = openRegister();
    const refused = register.close(closeInput(41_500, "curto"));
    expect(!refused.ok && refused.error.code).toBe("CASH_DIFFERENCE_NEEDS_JUSTIFICATION");
    expect(!refused.ok && refused.error.params).toEqual({ amount: "R$ 15" });
    expect(register.isOpen).toBe(true);
    const closed = register.close(closeInput(41_500, "Troco dado a mais para um paciente"));
    expect(closed.ok && closed.value.differenceMinor).toBe(-1_500);
    expect(register.isOpen).toBe(false);
  });

  it("F11: a register with no difference closes without a justification", () => {
    const register = openRegister();
    const closed = register.close(closeInput(43_000, null));
    expect(closed.ok && closed.value.justification).toBeNull();
  });

  it("F11: a closed register refuses movements and a second closing", () => {
    const register = openRegister();
    register.close(closeInput(43_000, null));
    const movement = register.assertOpenForMovement();
    expect(!movement.ok && movement.error.code).toBe("CASH_REGISTER_CLOSED");
    const again = register.close(closeInput(43_000, null));
    expect(!again.ok && again.error.code).toBe("CASH_REGISTER_CLOSED");
  });

  it("F11: reopening needs a reason and keeps the previous closing", () => {
    const register = openRegister();
    const closing = register.close(closeInput(43_000, null));
    if (!closing.ok) throw new Error("close failed");
    const refused = register.reopen({
      reopeningId: "re",
      lastClosingId: closing.value.id,
      reason: "curto",
      userId: "m",
      now: NOW,
    });
    expect(!refused.ok && refused.error.code).toBe("CASH_REASON_REQUIRED");
    const reopened = register.reopen({
      reopeningId: "re",
      lastClosingId: closing.value.id,
      reason: "Pagamento lançado na unidade errada",
      userId: "m",
      now: NOW,
    });
    expect(reopened.ok && reopened.value.closingId).toBe("c1");
    expect(register.isOpen).toBe(true);
  });

  it("F11: only managers open a past date and nobody opens a future one", () => {
    const base = { today: "2026-10-09" };
    expect(checkOpenDate({ ...base, businessDate: "2026-10-09", canOpenPast: false }).ok).toBe(true);
    const past = checkOpenDate({ ...base, businessDate: "2026-10-08", canOpenPast: false });
    expect(!past.ok && past.error.code).toBe("CASH_DATE_NOT_ALLOWED");
    expect(checkOpenDate({ ...base, businessDate: "2026-10-08", canOpenPast: true }).ok).toBe(true);
    const future = checkOpenDate({ ...base, businessDate: "2026-10-10", canOpenPast: true });
    expect(!future.ok && future.error.code).toBe("CASH_FUTURE_DATE");
  });

  it("F11: an open register of an earlier day is flagged once", () => {
    const register = openRegister();
    expect(register.flagUnclosed("2026-10-09", NOW)).toBe(false);
    expect(register.flagUnclosed("2026-10-10", NOW)).toBe(true);
    expect(register.flagUnclosed("2026-10-10", NOW)).toBe(false);
  });
});

function pendingEntry() {
  return FinancialEntry.create({
    id: "e1",
    organizationId: "o1",
    kind: "EXPENSE",
    description: "Aluguel da sala 3",
    categoryId: "c1",
    unitId: null,
    currency: "BRL",
    amountMinor: 350_000,
    dueDate: "2026-10-10",
    seriesId: null,
    occurrenceIndex: null,
    attachmentId: null,
    createdById: "user",
  });
}

describe("financial entries", () => {
  it("F11: a paid entry cannot be edited or deleted, only reversed with a reason", () => {
    const entry = pendingEntry();
    expect(
      entry.pay({ paymentId: "p1", paidOn: "2026-10-09", method: "PIX", userId: "u", now: NOW }).ok,
    ).toBe(true);
    const edit = entry.edit({
      description: "Outro",
      categoryId: "c1",
      unitId: null,
      currency: "BRL",
      amountMinor: 1,
      dueDate: "2026-10-10",
      attachmentId: null,
    });
    expect(!edit.ok && edit.error.code).toBe("FINANCE_ENTRY_PAID");
    const removed = entry.softDelete({ userId: "u", now: NOW });
    expect(!removed.ok && removed.error.code).toBe("FINANCE_ENTRY_PAID");
    const noReason = entry.reversePayment({ reason: "curto", userId: "u", now: NOW });
    expect(!noReason.ok && noReason.error.code).toBe("CASH_REASON_REQUIRED");
    expect(entry.reversePayment({ reason: "Pagamento lançado duas vezes", userId: "u", now: NOW }).ok).toBe(
      true,
    );
    expect(entry.snapshot.status).toBe("PENDING");
  });

  it("F11: monthly due dates clamp to the last day of short months without drifting", () => {
    expect([0, 1, 2, 3].map((index) => occurrenceDueDate("2026-01-31", index))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("F11: a series keeps 12 future occurrences", () => {
    const first = occurrencesToAdd({ firstDueDate: "2026-10-10", existingIndexes: [], today: "2026-10-09" });
    expect(first).toHaveLength(12);
    expect(first[11]?.dueDate).toBe("2027-09-10");
    // Three months later, indexes 0-2 are in the past and 12 future ones are wanted.
    const later = occurrencesToAdd({
      firstDueDate: "2026-10-10",
      existingIndexes: Array.from({ length: 12 }, (_, index) => index),
      today: "2027-01-11",
    });
    expect(later.map((item) => item.index)).toEqual([12, 13, 14, 15]);
  });
});

describe("statement", () => {
  it("F11: the running balance starts from the previous balance", () => {
    const statement = buildStatement({
      previousBalanceMinor: 1_250_000,
      lines: [
        {
          date: "2026-09-05",
          source: "EXPENSE",
          description: "Aluguel",
          category: "Aluguel",
          amountMinor: -350_000,
          order: "a",
        },
        {
          date: "2026-09-01",
          source: "PATIENT",
          description: "Cobrança",
          category: null,
          amountMinor: 25_000,
          order: "a",
        },
      ],
    });
    expect(statement.lines.map((line) => line.balanceMinor)).toEqual([1_275_000, 925_000]);
    expect(statement.resultMinor).toBe(-325_000);
    expect(statement.closingBalanceMinor).toBe(925_000);
    expect(statement.totalsBySource.EXPENSE).toBe(-350_000);
  });
});
