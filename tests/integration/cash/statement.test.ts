import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cash } from "@/modules/cash";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  addDays,
  billingWorld,
  categoryId,
  mustCreateEntry,
  mustMove,
  mustOpen,
  pay,
  today,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

async function paidEntry(overrides: Record<string, unknown>, paidOn: string) {
  const created = await mustCreateEntry(world, overrides);
  const paid = await cash.payEntry(world.manager, { entryId: created.entry.id, paidOn, method: "PIX" });
  if (!paid.ok) throw new Error(paid.error.code);
}

describe("statement", () => {
  it("F11: the statement lists payments, revenues, paid expenses and cash movements with a correct running balance", async () => {
    const date = await today(world);
    const yesterday = addDays(date, -1);
    // Before the period: a revenue of R$ 100,00 yesterday.
    await paidEntry(
      {
        kind: "REVENUE",
        description: "Aluguel de sala ontem",
        categoryId: await categoryId(world, "REVENUE", "Aluguel de sala"),
        amountMinor: 10_000,
        dueDate: yesterday,
      },
      yesterday,
    );
    // In the period.
    await pay(world, 25_000, "PIX");
    await paidEntry(
      {
        kind: "REVENUE",
        description: "Aluguel de sala hoje",
        categoryId: await categoryId(world, "REVENUE", "Aluguel de sala"),
        amountMinor: 5_000,
        dueDate: date,
      },
      date,
    );
    await paidEntry({ description: "Materiais", amountMinor: 3_000, dueDate: date }, date);
    const register = await mustOpen(world);
    await mustMove(world, register.id, "OUT", 1_000);
    // A transfer moves cash around: it counts in the drawer but stays out of the statement.
    await mustMove(world, register.id, "IN", 4_000, { categoryId: await categoryId(world, "TRANSFER") });

    const statement = await cash.getStatement(world.manager, {
      unit: "ALL",
      from: date,
      to: date,
      currency: "BRL",
    });
    expect(statement.ok && statement.value.previousBalanceMinor).toBe(10_000);
    expect(statement.ok && statement.value.lines.map((line) => [line.source, line.balanceMinor])).toEqual([
      ["PATIENT", 35_000],
      ["REVENUE", 40_000],
      ["CASH_OUT", 39_000],
      ["EXPENSE", 36_000],
    ]);
    expect(statement.ok && statement.value.resultMinor).toBe(26_000);
    expect(statement.ok && statement.value.closingBalanceMinor).toBe(36_000);
    expect(statement.ok && statement.value.totalsBySource).toEqual({
      PATIENT: 25_000,
      REVENUE: 5_000,
      EXPENSE: -3_000,
      CASH_IN: 0,
      CASH_OUT: -1_000,
    });
  });

  it("F11: a statement period above 366 days is refused and 366 days are accepted", async () => {
    const date = await today(world);
    const tooLong = await cash.getStatement(world.manager, {
      unit: world.unitId,
      from: addDays(date, -366),
      to: date,
    });
    expect(!tooLong.ok && tooLong.error.code).toBe("FINANCE_PERIOD_TOO_LONG");
    const exact = await cash.getStatement(world.manager, {
      unit: world.unitId,
      from: addDays(date, -365),
      to: date,
    });
    expect(exact.ok).toBe(true);
  });

  it("F11: the statement refuses mixed currencies without a currency choice and never adds across them", async () => {
    const date = await today(world);
    await pay(world, 25_000, "PIX");
    const mixed = await cash.getStatement(world.manager, { unit: "ALL", from: date, to: date });
    expect(!mixed.ok && mixed.error.code).toBe("FINANCE_CURRENCY_REQUIRED");
    const brl = await cash.getStatement(world.manager, {
      unit: "ALL",
      from: date,
      to: date,
      currency: "BRL",
    });
    expect(brl.ok && brl.value.closingBalanceMinor).toBe(25_000);
    const eur = await cash.getStatement(world.manager, {
      unit: "ALL",
      from: date,
      to: date,
      currency: "EUR",
    });
    expect(eur.ok && eur.value.closingBalanceMinor).toBe(0);
  });

  it("F11: front desk cannot read the statement", async () => {
    const date = await today(world);
    const denied = await cash.getStatement(world.desk, { unit: world.unitId, from: date, to: date });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
  });
});
