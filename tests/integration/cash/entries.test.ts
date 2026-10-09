import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cash } from "@/modules/cash";
import { db } from "@/shared/db/client";
import { createTranslator } from "@/shared/i18n/translator";
import { errorMessage } from "@/shared/kernel/action-result";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  addDays,
  billingWorld,
  categoryId,
  entryInput,
  mustCreateEntry,
  REASON,
  today,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

const pt = createTranslator("pt-BR");

describe("entries", () => {
  it("F11: a monthly expense generates 12 occurrences", async () => {
    const created = await mustCreateEntry(world, { repeatMonthly: true });
    expect(created.occurrences).toBe(12);
    const rows = await db().financialEntry.findMany({
      where: { seriesId: created.seriesId },
      orderBy: { occurrenceIndex: "asc" },
    });
    expect(rows).toHaveLength(12);
    expect(rows.map((row) => row.occurrenceIndex)).toEqual([...Array(12).keys()]);
    const due = rows.map((row) => row.dueDate.toISOString().slice(0, 10));
    expect(due[0]).toBe(addDays(await today(world), 5));
    expect(new Set(due).size).toBe(12);
  });

  it("F11: overdue unpaid expenses are flagged as overdue", async () => {
    const date = await today(world);
    await mustCreateEntry(world, { description: "Conta de luz vencida", dueDate: addDays(date, -3) });
    await mustCreateEntry(world, { description: "Conta de água futura", dueDate: addDays(date, 4) });
    const paid = await mustCreateEntry(world, { description: "Internet paga", dueDate: addDays(date, -2) });
    await cash.payEntry(world.manager, { entryId: paid.entry.id, paidOn: date, method: "PIX" });

    const listed = await cash.listEntries(world.manager, { kind: "EXPENSE" });
    expect(
      listed.ok && Object.fromEntries(listed.value.entries.map((e) => [e.description, e.overdue])),
    ).toEqual({
      "Conta de luz vencida": true,
      "Conta de água futura": false,
      "Internet paga": false,
    });
    const overdue = await cash.listEntries(world.manager, { kind: "EXPENSE", status: "OVERDUE" });
    expect(overdue.ok && overdue.value.entries.map((e) => e.description)).toEqual(["Conta de luz vencida"]);
  });

  it("F11: only pending entries can be deleted, by managers; the row stays", async () => {
    const created = await mustCreateEntry(world);
    const denied = await cash.deleteEntry(world.desk, { entryId: created.entry.id });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");

    const removed = await cash.deleteEntry(world.manager, { entryId: created.entry.id });
    expect(removed.ok && removed.value.removed).toBe(1);
    expect(
      (await db().financialEntry.findUniqueOrThrow({ where: { id: created.entry.id } })).deletedAt,
    ).not.toBeNull();

    const paid = await mustCreateEntry(world, { description: "Material pago" });
    await cash.payEntry(world.manager, { entryId: paid.entry.id, paidOn: await today(world), method: "PIX" });
    const refused = await cash.deleteEntry(world.manager, { entryId: paid.entry.id });
    expect(!refused.ok && refused.error.code).toBe("FINANCE_ENTRY_PAID");
    if (!refused.ok) {
      expect(errorMessage(pt, "cash", refused.error.code, refused.error.params)).toBe(
        "Despesas pagas não podem ser alteradas ou excluídas. Estorne o pagamento informando o motivo.",
      );
    }
  });

  it("F11: reversing a paid expense keeps the payment history", async () => {
    const created = await mustCreateEntry(world);
    const date = await today(world);
    expect(
      (await cash.payEntry(world.manager, { entryId: created.entry.id, paidOn: date, method: "PIX" })).ok,
    ).toBe(true);
    const short = await cash.reverseEntryPayment(world.manager, {
      entryId: created.entry.id,
      reason: "curto",
    });
    expect(!short.ok && short.error.code).toBe("CASH_REASON_REQUIRED");
    expect(
      (
        await cash.reverseEntryPayment(world.manager, {
          entryId: created.entry.id,
          reason: "Pago duas vezes",
        })
      ).ok,
    ).toBe(true);
    expect(
      (await cash.payEntry(world.manager, { entryId: created.entry.id, paidOn: date, method: "CASH" })).ok,
    ).toBe(true);
    const payments = await db().financialEntryPayment.findMany({
      where: { entryId: created.entry.id },
      orderBy: { recordedAt: "asc" },
    });
    expect(payments.map((payment) => [payment.method, payment.reversedAt !== null])).toEqual([
      ["PIX", true],
      ["CASH", false],
    ]);
  });

  it("F11: ending a series removes the future pending occurrences only", async () => {
    const date = await today(world);
    const created = await mustCreateEntry(world, { repeatMonthly: true, dueDate: addDays(date, -2) });
    const ended = await cash.endSeries(world.manager, { seriesId: created.seriesId });
    expect(ended.ok && ended.value.removed).toBe(11);
    const live = await db().financialEntry.findMany({
      where: { seriesId: created.seriesId, deletedAt: null },
    });
    expect(live).toHaveLength(1);
    const again = await cash.endSeries(world.manager, { seriesId: created.seriesId });
    expect(!again.ok && again.error.code).toBe("FINANCE_SERIES_ENDED");
  });

  it("F11: editing the following occurrences updates the pending ones of the series", async () => {
    const created = await mustCreateEntry(world, { repeatMonthly: true });
    const second = await db().financialEntry.findFirstOrThrow({
      where: { seriesId: created.seriesId, occurrenceIndex: 1 },
    });
    const input = await entryInput(world, {
      amountMinor: 400_000,
      dueDate: second.dueDate.toISOString().slice(0, 10),
    });
    const updated = await cash.updateEntry(world.manager, {
      ...input,
      entryId: second.id,
      scope: "FOLLOWING",
    });
    expect(updated.ok && updated.value.updated).toBe(11);
    const amounts = await db().financialEntry.findMany({
      where: { seriesId: created.seriesId },
      orderBy: { occurrenceIndex: "asc" },
    });
    expect(amounts.map((row) => Number(row.amountMinor))).toEqual([350_000, ...Array(11).fill(400_000)]);
  });

  it("F11: front desk and professionals cannot manage entries, and every denial is audited", async () => {
    for (const ctx of [world.desk, world.pro]) {
      const denied = await cash.createEntry(ctx, await entryInput(world));
      expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
    }
    expect(await db().auditEvent.count({ where: { action: "PERMISSION_DENIED" } })).toBe(2);
  });

  it("F11: a currency outside the active units and a wrong category kind are refused", async () => {
    const currency = await cash.createEntry(
      world.manager,
      await entryInput(world, { unitId: null, currency: "JPY" }),
    );
    expect(currency.ok).toBe(false);
    const wrongCurrency = await cash.createEntry(world.manager, await entryInput(world, { currency: "EUR" }));
    expect(!wrongCurrency.ok && wrongCurrency.error.code).toBe("FINANCE_CURRENCY_NOT_AVAILABLE");
    const revenueCategory = await categoryId(world, "REVENUE");
    const wrongKind = await cash.createEntry(
      world.manager,
      await entryInput(world, { categoryId: revenueCategory }),
    );
    expect(!wrongKind.ok && wrongKind.error.code).toBe("CASH_CATEGORY_NOT_ALLOWED");
    // "Geral" in the currency of an active unit is allowed.
    const general = await cash.createEntry(
      world.manager,
      await entryInput(world, { unitId: null, currency: "EUR" }),
    );
    expect(general.ok).toBe(true);
  });
});

describe("categories", () => {
  it("F11: the default categories exist, the transfer category is locked and names are unique", async () => {
    const listed = await cash.listCategories(world.desk);
    expect(
      listed.ok && listed.value.filter((category) => category.kind === "EXPENSE").map((c) => c.name),
    ).toEqual([
      "Aluguel",
      "Impostos",
      "Marketing",
      "Materiais",
      "Outros",
      "Salários",
      "Serviços de terceiros",
      "Utilidades",
    ]);
    const transfer = listed.ok ? listed.value.find((category) => category.kind === "TRANSFER") : undefined;
    expect(transfer).toMatchObject({ name: "Transferência", system: true });

    const renamed = await cash.saveCategory(world.manager, {
      categoryId: transfer?.id,
      kind: "EXPENSE",
      name: "Outro nome",
    });
    expect(!renamed.ok && renamed.error.code).toBe("FINANCE_CATEGORY_SYSTEM");
    const duplicate = await cash.saveCategory(world.manager, { kind: "EXPENSE", name: "aluguel" });
    expect(!duplicate.ok && duplicate.error.code).toBe("FINANCE_CATEGORY_NAME_TAKEN");
    const created = await cash.saveCategory(world.manager, { kind: "EXPENSE", name: "Limpeza" });
    expect(created.ok).toBe(true);
    const denied = await cash.saveCategory(world.desk, { kind: "EXPENSE", name: "Outra" });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
    void REASON;
  });
});
