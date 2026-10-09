import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { billing } from "@/modules/billing";
import { cash } from "@/modules/cash";
import { db } from "@/shared/db/client";
import { createTranslator } from "@/shared/i18n/translator";
import { errorMessage } from "@/shared/kernel/action-result";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  addDays,
  billingWorld,
  manualCharge,
  mustClose,
  mustMove,
  mustOpen,
  mustReceive,
  pay,
  receive,
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
const text = (value: string) => value.replace(/ /g, " ");

describe("opening", () => {
  it("F11: only one cash register exists per unit and day, and opening again returns it", async () => {
    const first = await cash.openRegister(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
      openingMinor: 0,
    });
    const again = await cash.openRegister(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
      openingMinor: 0,
    });
    expect(first.ok && first.value.alreadyOpen).toBe(false);
    expect(again.ok && again.value.alreadyOpen).toBe(true);
    expect(again.ok && first.ok && again.value.register.id).toBe(first.ok && first.value.register.id);
    expect(await db().cashRegister.count()).toBe(1);
  });

  it("F11: the opening balance defaults to the last counted cash of the unit and a change needs a reason", async () => {
    const yesterday = addDays(await today(world), -1);
    // A manager opens and closes yesterday (a forgotten day), counting R$ 350,00.
    const past = await cash.openRegister(world.manager, {
      unitId: world.unitId,
      businessDate: yesterday,
      openingMinor: 0,
    });
    if (!past.ok) throw new Error(past.error.code);
    await mustClose(world, past.value.register.id, 35_000, REASON, world.manager);

    const day = await cash.getRegisterDay(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
    });
    expect(day.ok && day.value.suggestedOpeningMinor).toBe(35_000);

    const changed = await cash.openRegister(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
      openingMinor: 30_000,
      openingReason: "curto",
    });
    expect(!changed.ok && changed.error.code).toBe("CASH_OPENING_REASON_REQUIRED");

    const opened = await mustOpen(world, { openingMinor: 35_000 });
    expect(opened).toMatchObject({
      openingMinor: 35_000,
      suggestedOpeningMinor: 35_000,
      openingReason: null,
    });
  });

  it("F11: front desk cannot open a past date and a manager can; nobody opens a future date", async () => {
    const date = await today(world);
    const past = await cash.openRegister(world.desk, {
      unitId: world.unitId,
      businessDate: addDays(date, -2),
      openingMinor: 0,
    });
    expect(!past.ok && past.error.code).toBe("CASH_DATE_NOT_ALLOWED");
    const allowed = await cash.openRegister(world.manager, {
      unitId: world.unitId,
      businessDate: addDays(date, -2),
      openingMinor: 0,
    });
    expect(allowed.ok).toBe(true);
    for (const ctx of [world.desk, world.manager]) {
      const future = await cash.openRegister(ctx, {
        unitId: world.unitId,
        businessDate: addDays(date, 1),
        openingMinor: 0,
      });
      expect(!future.ok && future.error.code).toBe("CASH_FUTURE_DATE");
    }
  });

  it("F11 → F02 and F16: a register uses its unit's currency and time zone", async () => {
    const date = await today(world, world.ptUnitId);
    const opened = await cash.openRegister(world.desk, {
      unitId: world.ptUnitId,
      businessDate: date,
      openingMinor: 0,
    });
    expect(opened.ok && opened.value.register.currency).toBe("EUR");
  });

  it("F11: professionals cannot use the cash register and the denial is audited", async () => {
    const denied = await cash.openRegister(world.pro, {
      unitId: world.unitId,
      businessDate: await today(world),
      openingMinor: 0,
    });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
    expect(await db().auditEvent.count({ where: { action: "PERMISSION_DENIED" } })).toBeGreaterThan(0);
  });
});

describe("the day", () => {
  it("F11: payments and refunds of the unit on that day appear grouped by method, also before the register opens", async () => {
    await pay(world, 30_000, "PIX");
    const cashCharge = await manualCharge(world, 25_000);
    const paid = await mustReceive(world, cashCharge.id, 25_000, "CASH");
    const before = await cash.getRegisterDay(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
    });
    expect(before.ok && before.value.register).toBeNull();
    expect(before.ok && before.value.byMethod).toEqual([
      { method: "CASH", receivedMinor: 25_000, refundedMinor: 0, netMinor: 25_000 },
      { method: "PIX", receivedMinor: 30_000, refundedMinor: 0, netMinor: 30_000 },
    ]);

    const refund = await billing.refundPayment(world.manager, {
      chargeId: cashCharge.id,
      paymentId: paid.payments[0]?.id,
      amountMinor: 2_000,
      reason: "Pagamento duplicado",
      unitId: world.unitId,
    });
    expect(refund.ok).toBe(true);
    await mustOpen(world);
    const day = await cash.getRegisterDay(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
    });
    expect(day.ok && day.value.byMethod[0]).toEqual({
      method: "CASH",
      receivedMinor: 25_000,
      refundedMinor: 2_000,
      netMinor: 23_000,
    });
    expect(day.ok && day.value.lines.filter((line) => line.source !== "MOVEMENT")).toHaveLength(3);
  });

  it("F11 → F09: only Dinheiro changes the expected cash: opening + cash payments − cash refunds + entries − withdrawals", async () => {
    const register = await mustOpen(world, { openingMinor: 10_000, openingReason: "Troco deixado no cofre" });
    await pay(world, 30_000, "PIX");
    const cashCharge = await manualCharge(world, 25_000);
    const paid = await mustReceive(world, cashCharge.id, 25_000, "CASH");
    await billing.refundPayment(world.manager, {
      chargeId: cashCharge.id,
      paymentId: paid.payments[0]?.id,
      amountMinor: 2_000,
      reason: "Pagamento duplicado",
      unitId: world.unitId,
    });
    await mustMove(world, register.id, "IN", 1_000);
    const out = await mustMove(world, register.id, "OUT", 4_590);

    const day = await cash.getRegisterDay(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
    });
    // 10000 + 25000 − 2000 + 1000 − 4590
    expect(day.ok && day.value.expectedMinor).toBe(29_410);

    // A reversed withdrawal leaves the expected cash.
    const reversed = await cash.reverseMovement(world.desk, {
      movementId: out.id,
      reason: "Valor digitado errado",
    });
    expect(reversed.ok).toBe(true);
    const after = await cash.getRegisterDay(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
    });
    expect(after.ok && after.value.expectedMinor).toBe(34_000);
  });
});

describe("closing", () => {
  it("F11: closing with a non-zero difference requires a justification of at least 10 characters", async () => {
    const register = await mustOpen(world);
    await mustReceive(world, (await manualCharge(world, 20_000)).id, 20_000, "CASH");

    const missing = await cash.closeRegister(world.desk, { registerId: register.id, countedMinor: 18_500 });
    expect(!missing.ok && missing.error.code).toBe("CASH_DIFFERENCE_NEEDS_JUSTIFICATION");
    if (!missing.ok) {
      expect(text(errorMessage(pt, "cash", missing.error.code, missing.error.params))).toBe(
        "Informe a justificativa para a diferença de R$ 15,00.",
      );
    }
    const short = await cash.closeRegister(world.desk, {
      registerId: register.id,
      countedMinor: 18_500,
      justification: "curto",
    });
    expect(!short.ok && short.error.code).toBe("CASH_DIFFERENCE_NEEDS_JUSTIFICATION");

    const closed = await cash.closeRegister(world.desk, {
      registerId: register.id,
      countedMinor: 18_500,
      justification: "Troco dado a mais para um paciente",
    });
    expect(closed.ok && closed.value.closing).toMatchObject({
      sequence: 1,
      expectedMinor: 20_000,
      countedMinor: 18_500,
      differenceMinor: -1_500,
    });
    expect(closed.ok && closed.value.register.status).toBe("CLOSED");
  });

  it("F11: closing with no difference needs no justification", async () => {
    const register = await mustOpen(world);
    const closed = await mustClose(world, register.id, 0);
    expect(closed.closing.differenceMinor).toBe(0);
  });

  it("F11: a closed register rejects new manual entries", async () => {
    const register = await mustOpen(world);
    await mustClose(world, register.id, 0);
    const rejected = await cash.recordMovement(world.desk, {
      registerId: register.id,
      direction: "OUT",
      amountMinor: 1_000,
      description: "Compra de material",
      categoryId: (await cash.listCategories(world.desk).then((r) => (r.ok ? r.value : []))).find(
        (category) => category.kind === "EXPENSE",
      )?.id,
    });
    expect(!rejected.ok && rejected.error.code).toBe("CASH_REGISTER_CLOSED");
    if (!rejected.ok) {
      expect(errorMessage(pt, "cash", rejected.error.code, rejected.error.params)).toBe(
        "Este caixa está fechado. Solicite a reabertura a um gestor.",
      );
    }
  });

  it("F11 → F09: a closed register makes F09 refuse payments and refunds in that unit and day", async () => {
    const charge = await manualCharge(world, 20_000);
    const paid = await mustReceive(world, charge.id, 5_000, "CASH");
    const register = await mustOpen(world);
    await mustClose(world, register.id, 5_000);

    const blocked = await receive(world, charge.id, [{ method: "PIX", amountMinor: 1_000 }]);
    expect(!blocked.ok && blocked.error.code).toBe("BILLING_CASH_REGISTER_CLOSED");
    if (!blocked.ok) {
      expect(text(errorMessage(pt, "billing", blocked.error.code, blocked.error.params))).toMatch(
        /^O caixa da unidade .+ de hoje já foi fechado\. Solicite a reabertura a um gestor\.$/,
      );
    }
    const refund = await billing.refundPayment(world.manager, {
      chargeId: charge.id,
      paymentId: paid.payments[0]?.id,
      reason: "Pagamento duplicado",
      unitId: world.unitId,
    });
    expect(!refund.ok && refund.error.code).toBe("BILLING_CASH_REGISTER_CLOSED");
    // Another unit is not affected.
    const ptCharge = await billing.createManualCharge(world.desk, {
      patientId: world.patients.maria,
      unitId: world.ptUnitId,
      description: "Taxa",
      grossMinor: 5_000,
    });
    if (!ptCharge.ok) throw new Error(ptCharge.error.code);
    const ptPayment = await billing.receivePayment(world.desk, {
      chargeId: ptCharge.value.id,
      submissionKey: crypto.randomUUID(),
      unitId: world.ptUnitId,
      payments: [{ method: "CASH", amountMinor: 5_000 }],
    });
    expect(ptPayment.ok).toBe(true);
  });

  it("F11: only managers reopen, with a reason, and both closings remain in history", async () => {
    const register = await mustOpen(world);
    await mustClose(world, register.id, 0);

    const denied = await cash.reopenRegister(world.desk, { registerId: register.id, reason: REASON });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
    const short = await cash.reopenRegister(world.manager, { registerId: register.id, reason: "curto" });
    expect(short.ok).toBe(false);
    const reopened = await cash.reopenRegister(world.manager, {
      registerId: register.id,
      reason: "Pagamento lançado na unidade errada",
    });
    expect(reopened.ok && reopened.value.register.status).toBe("OPEN");
    // The payment that was refused can now be received, and the register closes again.
    await mustReceive(world, (await manualCharge(world, 3_000)).id, 3_000, "CASH");
    const second = await mustClose(world, register.id, 3_000);
    expect(second.closing.sequence).toBe(2);

    const day = await cash.getRegisterDay(world.desk, {
      unitId: world.unitId,
      businessDate: await today(world),
    });
    expect(day.ok && day.value.history.map((item) => item.kind)).toEqual(["CLOSING", "REOPENING", "CLOSING"]);
    expect(await db().cashRegisterClosing.count()).toBe(2);
    expect(await db().cashRegisterReopening.count()).toBe(1);
  });

  it("F11: a closing and a concurrent payment serialize on the register lock", async () => {
    const register = await mustOpen(world);
    const charge = await manualCharge(world, 20_000);
    const [closed, payment] = await Promise.all([
      cash.closeRegister(world.desk, {
        registerId: register.id,
        countedMinor: 0,
        justification: "Contagem feita antes do pagamento",
      }),
      receive(world, charge.id, [{ method: "CASH", amountMinor: 20_000 }]),
    ]);
    expect(closed.ok).toBe(true);
    // Whatever the order, the closing and the payments agree: the payment is either in the closing
    // or was refused because the day was already closed.
    const closing = await db().cashRegisterClosing.findFirstOrThrow({ where: { registerId: register.id } });
    const stored = await db().payment.aggregate({
      _sum: { amountMinor: true },
      where: { chargeId: charge.id },
    });
    const cashInClosing = Number(closing.expectedMinor);
    expect(cashInClosing).toBe(Number(stored._sum.amountMinor ?? 0));
    if (payment.ok) expect(cashInClosing).toBe(20_000);
    else expect(payment.error.code).toBe("BILLING_CASH_REGISTER_CLOSED");
  });

  it("F11 → F02: a unit with cash records cannot change its country", async () => {
    await mustOpen(world, {}, world.desk);
    const { units } = await import("@/modules/units");
    const unit = await units.getUnit(world.admin, world.unitId);
    if (!unit.ok) throw new Error("getUnit failed");
    const moved = await units.updateUnit(world.admin, {
      name: unit.value.name,
      country: "ES",
      timeZone: "Europe/Madrid",
      email: null,
      unitId: world.unitId,
      version: unit.value.version,
      phone: null,
      address: {},
    });
    expect(!moved.ok && moved.error.code).toBe("UNITS_COUNTRY_LOCKED");
  });

  it("F11: every mutation writes an audit event", async () => {
    const register = await mustOpen(world);
    const movement = await mustMove(world, register.id, "OUT", 1_000);
    await cash.reverseMovement(world.desk, { movementId: movement.id, reason: "Valor digitado errado" });
    await mustClose(world, register.id, 0);
    await cash.reopenRegister(world.manager, { registerId: register.id, reason: REASON });
    const events = await db().auditEvent.findMany({
      where: { entityType: { in: ["cash_register", "cash_movement"] } },
      orderBy: { occurredAt: "asc" },
    });
    expect(events.map((event) => event.summary)).toEqual([
      "Caixa aberto",
      "Saída manual do caixa",
      "Movimentação do caixa estornada",
      "Caixa fechado",
      "Caixa reaberto",
    ]);
  });
});
