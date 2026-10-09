import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { billing } from "@/modules/billing";
import { eventBus } from "@/shared/db/transaction";
import { db } from "@/shared/db/client";
import { createTranslator } from "@/shared/i18n/translator";
import { errorMessage } from "@/shared/kernel/action-result";
import { domainError } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok } from "@/shared/kernel/result";
import { closeHelpers, resetDatabase } from "../helpers";
import { createUnitWithHours } from "../professionals/support";
import {
  appointmentAt,
  billingWorld,
  chargeFor,
  manualCharge,
  moveTo,
  mustReceive,
  receive,
  receiveInput,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterEach(() => billing.registerCashRegisterGate(null));
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

const recorded: { type: string; payload: Record<string, unknown> }[] = [];
for (const type of ["PaymentRegistered", "PaymentRefunded", "ChargeCreated", "ChargeVoided"]) {
  eventBus.subscribe(type, async (event) => void recorded.push({ type, payload: event.payload }));
}
beforeEach(() => void (recorded.length = 0));

const pt = createTranslator("pt-BR");
const text = (value: string) => value.replace(/ /g, " ");

describe("payments", () => {
  it("F09: multiple payments update the status to partially paid and then paid; a payment above the balance is rejected", async () => {
    const charge = await manualCharge(world, 20_000);
    const first = await receive(world, charge.id, [
      { method: "PIX", amountMinor: 5000 },
      { method: "CREDIT_CARD", amountMinor: 5000, installments: 3 },
    ]);
    expect(first.ok && first.value.charge).toMatchObject({
      status: "PARTIALLY_PAID",
      paidMinor: 10_000,
      balanceMinor: 10_000,
    });
    expect(first.ok && first.value.payments).toHaveLength(2);

    const over = await receive(world, charge.id, [{ method: "CASH", amountMinor: 25_000 }]);
    expect(!over.ok && over.error.code).toBe("BILLING_PAYMENT_EXCEEDS_BALANCE");
    if (!over.ok) {
      const message = errorMessage(pt, "billing", over.error.code, over.error.params);
      expect(text(message)).toBe("O valor informado (R$ 250,00) é maior que o saldo em aberto (R$ 100,00).");
    }

    const rest = await receive(world, charge.id, [{ method: "CASH", amountMinor: 10_000 }]);
    expect(rest.ok && rest.value.charge.status).toBe("PAID");
    const again = await receive(world, charge.id, [{ method: "CASH", amountMinor: 100 }]);
    expect(!again.ok && again.error.code).toBe("BILLING_CHARGE_ALREADY_PAID");

    const exact = await manualCharge(world, 20_000);
    const message = await receive(world, exact.id, [{ method: "PIX", amountMinor: 25_000 }]);
    expect(!message.ok && text(errorMessage(pt, "billing", message.error.code, message.error.params))).toBe(
      "O valor informado (R$ 250,00) é maior que o saldo em aberto (R$ 200,00).",
    );
  });

  it("F09: resubmitting the same payment within 60 seconds does not create a duplicate", async () => {
    const charge = await manualCharge(world, 20_000);
    const input = receiveInput(world, charge.id, [{ method: "PIX", amountMinor: 8000 }]);
    const first = await billing.receivePayment(world.desk, input);
    const second = await billing.receivePayment(world.desk, input);
    expect(first.ok && first.value.replayed).toBe(false);
    expect(second.ok && second.value.replayed).toBe(true);
    expect(second.ok && first.ok && second.value.payments[0]?.id).toBe(
      first.ok && first.value.payments[0]?.id,
    );

    const parallel = receiveInput(world, charge.id, [{ method: "PIX", amountMinor: 4000 }]);
    const results = await Promise.all([
      billing.receivePayment(world.desk, parallel),
      billing.receivePayment(world.desk, parallel),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.filter((result) => result.ok && result.value.replayed)).toHaveLength(1);
    const row = await db().charge.findUniqueOrThrow({
      where: { id: charge.id },
      include: { payments: true },
    });
    expect(row.payments).toHaveLength(2);
    expect(row.paidMinor).toBe(12_000n);
  });

  it("F09: two concurrent payments cannot exceed the balance", async () => {
    const charge = await manualCharge(world, 20_000);
    const results = await Promise.all([
      receive(world, charge.id, [{ method: "PIX", amountMinor: 15_000 }]),
      receive(world, charge.id, [{ method: "PIX", amountMinor: 15_000 }]),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const failed = results.find((result) => !result.ok);
    expect(!failed?.ok && failed?.error.code).toBe("BILLING_PAYMENT_EXCEEDS_BALANCE");
    expect((await db().charge.findUniqueOrThrow({ where: { id: charge.id } })).paidMinor).toBe(15_000n);
  });

  it("F09: a payment is attributed to the unit selected when it is recorded", async () => {
    const appointmentId = await appointmentAt(world, { status: ["CHECKED_IN"] });
    const charge = await chargeFor(appointmentId);
    const centro = await createUnitWithHours(world.admin, { name: "Unidade Norte" });
    const paid = await receive(world, charge.id, [{ method: "PIX", amountMinor: 10_000 }], {
      unitId: centro,
    });
    expect(paid.ok && paid.value.payments[0]).toMatchObject({ unitId: centro, unitName: "Unidade Norte" });
    expect((await db().payment.findFirstOrThrow({ where: { chargeId: charge.id } })).unitId).toBe(centro);
    expect(charge.unitId).toBe(world.unitId);
  });

  it("F09: a payment in a unit with another currency is refused", async () => {
    const charge = await manualCharge(world, 20_000);
    const result = await receive(world, charge.id, [{ method: "CASH", amountMinor: 1000 }], {
      unitId: world.ptUnitId,
    });
    expect(!result.ok && result.error.code).toBe("BILLING_CURRENCY_MISMATCH");
    expect(!result.ok && text(errorMessage(pt, "billing", result.error.code, result.error.params))).toBe(
      "A unidade selecionada usa outra moeda (EUR). Selecione uma unidade em BRL para receber esta cobrança.",
    );
    const missing = await receive(world, charge.id, [{ method: "CASH", amountMinor: 1000 }], {
      unitId: newId(),
    });
    expect(!missing.ok && missing.error.code).toBe("BILLING_UNIT_REQUIRED");
  });

  it("F09: only managers can backdate, up to 7 days", async () => {
    const charge = await manualCharge(world, 20_000);
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const desk = await receive(world, charge.id, [{ method: "PIX", amountMinor: 1000 }], {
      receivedAt: daysAgo(1),
    });
    expect(!desk.ok && desk.error.code).toBe("BILLING_BACKDATE_FORBIDDEN");
    const tooOld = await receive(
      world,
      charge.id,
      [{ method: "PIX", amountMinor: 1000 }],
      { receivedAt: daysAgo(8) },
      world.manager,
    );
    expect(!tooOld.ok && tooOld.error.code).toBe("BILLING_PAYMENT_DATE_INVALID");
    const future = await receive(
      world,
      charge.id,
      [{ method: "PIX", amountMinor: 1000 }],
      { receivedAt: new Date(Date.now() + 3_600_000).toISOString() },
      world.manager,
    );
    expect(!future.ok && future.error.code).toBe("BILLING_PAYMENT_DATE_INVALID");
    const ok7 = await receive(
      world,
      charge.id,
      [{ method: "PIX", amountMinor: 1000 }],
      { receivedAt: daysAgo(7) },
      world.manager,
    );
    expect(ok7.ok && Date.parse(ok7.value.payments[0]?.receivedAt ?? "")).toBeLessThan(
      Date.now() - 6 * 86_400_000,
    );
    const row = await db().payment.findFirstOrThrow({ where: { chargeId: charge.id } });
    expect(row.recordedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("F09: credit card needs 1 to 12 installments; other methods none", async () => {
    const charge = await manualCharge(world, 20_000);
    for (const installments of [0, 13]) {
      const result = await receive(world, charge.id, [
        { method: "CREDIT_CARD", amountMinor: 1000, installments },
      ]);
      expect(!result.ok).toBe(true);
    }
    const missing = await receive(world, charge.id, [{ method: "CREDIT_CARD", amountMinor: 1000 }]);
    expect(!missing.ok && missing.error.code).toBe("BILLING_INSTALLMENTS_INVALID");
    const pix = await receive(world, charge.id, [{ method: "PIX", amountMinor: 1000, installments: 2 }]);
    expect(!pix.ok && pix.error.code).toBe("BILLING_INSTALLMENTS_INVALID");
    const twelve = await receive(world, charge.id, [
      { method: "CREDIT_CARD", amountMinor: 1000, installments: 12 },
    ]);
    expect(twelve.ok && twelve.value.payments[0]?.installments).toBe(12);
  });

  it("F09: disabled payment methods are refused and at least one stays enabled", async () => {
    const charge = await manualCharge(world, 20_000);
    await mustReceive(world, charge.id, 1000, "OTHER");
    const off = await billing.setPaymentMethodEnabled(world.manager, {
      country: "BR",
      method: "OTHER",
      enabled: false,
    });
    expect(off.ok).toBe(true);
    const refused = await receive(world, charge.id, [{ method: "OTHER", amountMinor: 1000 }]);
    expect(!refused.ok && refused.error.code).toBe("BILLING_PAYMENT_METHOD_INVALID");
    expect(await db().payment.count({ where: { chargeId: charge.id, method: "OTHER" } })).toBe(1);

    for (const method of ["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD"]) {
      expect(
        (await billing.setPaymentMethodEnabled(world.manager, { country: "BR", method, enabled: false })).ok,
      ).toBe(true);
    }
    const last = await billing.setPaymentMethodEnabled(world.manager, {
      country: "BR",
      method: "TRANSFER",
      enabled: false,
    });
    expect(!last.ok && last.error.code).toBe("BILLING_PAYMENT_METHODS_EMPTY");
    const forbidden = await billing.setPaymentMethodEnabled(world.desk, {
      country: "BR",
      method: "CASH",
      enabled: true,
    });
    expect(!forbidden.ok && forbidden.error.code).toBe("AUTHZ_FORBIDDEN");
    const settings = await billing.listPaymentMethodSettings(world.manager);
    expect(
      settings.ok && settings.value.filter((item) => item.country === "BR" && item.enabled),
    ).toHaveLength(1);
  });

  it("F09: a closed cash register blocks payments and refunds through the gate", async () => {
    const charge = await manualCharge(world, 20_000);
    const paid = await mustReceive(world, charge.id, 5000);
    billing.registerCashRegisterGate({
      assertOpen: async (_uow, input) =>
        fail(domainError("BILLING_CASH_REGISTER_CLOSED", 409, undefined, { unit: input.unitName })),
    });
    const blocked = await receive(world, charge.id, [{ method: "PIX", amountMinor: 1000 }]);
    expect(!blocked.ok && blocked.error.code).toBe("BILLING_CASH_REGISTER_CLOSED");
    expect(!blocked.ok && errorMessage(pt, "billing", blocked.error.code, blocked.error.params)).toMatch(
      /^O caixa da unidade .+ de hoje já foi fechado\. Solicite a reabertura a um gestor\.$/,
    );
    const refund = await billing.refundPayment(world.manager, {
      chargeId: charge.id,
      paymentId: paid.payments[0]?.id,
      reason: "Pagamento duplicado",
      unitId: world.unitId,
    });
    expect(!refund.ok && refund.error.code).toBe("BILLING_CASH_REGISTER_CLOSED");
    billing.registerCashRegisterGate({ assertOpen: async () => ok(undefined) });
    expect((await receive(world, charge.id, [{ method: "PIX", amountMinor: 1000 }])).ok).toBe(true);
  });
});

describe("refunds and voids", () => {
  it("F09: front desk cannot void or refund; a manager can, only with a reason; a refund is a negative movement dated today and keeps the original", async () => {
    const charge = await manualCharge(world, 30_000);
    const paid = await mustReceive(world, charge.id, 30_000, "CREDIT_CARD");
    const paymentId = paid.payments[0]?.id ?? "";
    const refundInput = {
      chargeId: charge.id,
      paymentId,
      reason: "Procedimento cancelado",
      unitId: world.unitId,
    };

    const deskRefund = await billing.refundPayment(world.desk, refundInput);
    expect(!deskRefund.ok && deskRefund.error.code).toBe("AUTHZ_FORBIDDEN");
    const deskVoid = await billing.voidCharge(world.desk, { chargeId: charge.id, reason: "Erro" });
    expect(!deskVoid.ok && deskVoid.error.code).toBe("AUTHZ_FORBIDDEN");
    expect(await db().auditEvent.count({ where: { action: "PERMISSION_DENIED" } })).toBeGreaterThanOrEqual(2);

    const noReason = await billing.refundPayment(world.manager, { ...refundInput, reason: "" });
    expect(!noReason.ok && noReason.error.code).toBe("BILLING_REASON_REQUIRED");

    const done = await billing.refundPayment(world.manager, refundInput);
    expect(done.ok && done.value.charge).toMatchObject({ status: "OPEN", paidMinor: 0 });
    expect(done.ok && done.value.refund).toMatchObject({
      kind: "REFUND",
      amountMinor: -30_000,
      method: "CREDIT_CARD",
    });
    const rows = await db().payment.findMany({
      where: { chargeId: charge.id },
      orderBy: { recordedAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "PAYMENT", amountMinor: 30_000n, refundedMinor: 30_000n });
    expect(rows[1]).toMatchObject({ kind: "REFUND", amountMinor: -30_000n, refundedPaymentId: paymentId });
    expect(rows[1]?.receivedAt.toDateString()).toBe(new Date().toDateString());
    const again = await billing.refundPayment(world.manager, refundInput);
    expect(!again.ok && again.error.code).toBe("BILLING_NOT_REFUNDABLE");
  });

  it("F09: a charge with active payments cannot be voided", async () => {
    const charge = await manualCharge(world, 20_000);
    const paid = await mustReceive(world, charge.id, 5000);
    const blocked = await billing.voidCharge(world.manager, { chargeId: charge.id, reason: "Duplicada" });
    expect(!blocked.ok && blocked.error.code).toBe("BILLING_CHARGE_HAS_PAYMENTS");
    expect(!blocked.ok && errorMessage(pt, "billing", blocked.error.code, blocked.error.params)).toBe(
      "Estorne os pagamentos antes de cancelar esta cobrança.",
    );

    await billing.refundPayment(world.manager, {
      chargeId: charge.id,
      paymentId: paid.payments[0]?.id,
      reason: "Estorno total",
      unitId: world.unitId,
    });
    const noReason = await billing.voidCharge(world.manager, { chargeId: charge.id, reason: " " });
    expect(!noReason.ok && noReason.error.code).toBe("BILLING_REASON_REQUIRED");
    const voided = await billing.voidCharge(world.manager, {
      chargeId: charge.id,
      reason: "Cobrança duplicada",
    });
    expect(voided.ok && voided.value.status).toBe("CANCELLED");
    const after = await receive(world, charge.id, [{ method: "PIX", amountMinor: 100 }]);
    expect(!after.ok && after.error.code).toBe("BILLING_CHARGE_CANCELLED");
  });

  it("F09: a partial refund in the selected unit and a second refund up to the rest", async () => {
    const charge = await manualCharge(world, 20_000);
    const paid = await mustReceive(world, charge.id, 20_000);
    const centro = await createUnitWithHours(world.admin, { name: "Unidade Norte" });
    const base = {
      chargeId: charge.id,
      paymentId: paid.payments[0]?.id,
      reason: "Ajuste combinado",
      unitId: centro,
    };
    const first = await billing.refundPayment(world.manager, { ...base, amountMinor: 5000 });
    expect(first.ok && first.value.charge).toMatchObject({ status: "PARTIALLY_PAID", paidMinor: 15_000 });
    expect(first.ok && first.value.refund.unitId).toBe(centro);
    const over = await billing.refundPayment(world.manager, { ...base, amountMinor: 15_001 });
    expect(!over.ok && over.error.code).toBe("BILLING_REFUND_EXCEEDS");
    const rest = await billing.refundPayment(world.manager, { ...base, amountMinor: 15_000 });
    expect(rest.ok && rest.value.charge.status).toBe("OPEN");
    const third = await billing.refundPayment(world.manager, { ...base, amountMinor: 1 });
    expect(!third.ok && third.error.code).toBe("BILLING_NOT_REFUNDABLE");
  });

  it("F09 → F11: payments and refunds publish events with unit, method, amount and received date", async () => {
    const charge = await manualCharge(world, 20_000);
    const paid = await mustReceive(world, charge.id, 6000, "DEBIT_CARD");
    await billing.refundPayment(world.manager, {
      chargeId: charge.id,
      paymentId: paid.payments[0]?.id,
      reason: "Cobrança indevida",
      unitId: world.unitId,
    });
    const registered = recorded.find((event) => event.type === "PaymentRegistered");
    const refunded = recorded.find((event) => event.type === "PaymentRefunded");
    expect(registered?.payload).toMatchObject({
      chargeId: charge.id,
      unitId: world.unitId,
      method: "DEBIT_CARD",
      amountMinor: 6000,
      currency: "BRL",
    });
    expect(typeof registered?.payload.receivedAt).toBe("string");
    expect(refunded?.payload).toMatchObject({ method: "DEBIT_CARD", amountMinor: -6000 });
    expect(recorded.some((event) => event.type === "ChargeCreated")).toBe(true);
  });

  it("F09: every mutation is audited and a voided charge leaves the audit trail", async () => {
    const charge = await manualCharge(world, 20_000);
    await mustReceive(world, charge.id, 1000);
    const entries = await db().auditEvent.findMany({ where: { entityType: { in: ["charge", "payment"] } } });
    expect(entries.map((entry) => `${entry.entityType}:${entry.action}`).sort()).toEqual([
      "charge:CREATE",
      "payment:CREATE",
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/Maria|Silva/);
    await moveTo(world.desk, await appointmentAt(world, { status: ["CHECKED_IN"], startTime: "13:00" }), [
      "CONFIRMED",
    ]);
    const deleted = await db().auditEvent.findMany({ where: { entityType: "charge", action: "DELETE" } });
    expect(deleted).toHaveLength(1);
  });
});
