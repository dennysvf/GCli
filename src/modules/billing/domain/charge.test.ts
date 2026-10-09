import { describe, expect, it } from "vitest";
import { Charge } from "./charge";
import { formatChargeNumber } from "./status";

const NOW = new Date("2026-10-08T12:00:00Z");
const DESK = { userId: "desk", canApprove: false };
const MANAGER = { userId: "manager", canApprove: true };

function charge(grossMinor = 20_000): Charge {
  const created = Charge.create({
    id: "charge-1",
    organizationId: "org",
    number: formatChargeNumber(2026, 1),
    patientId: "patient",
    origin: "MANUAL",
    description: "Consulta",
    unitId: "unit",
    currency: "BRL",
    grossMinor,
    createdById: "desk",
    now: NOW,
  });
  if (!created.ok) throw new Error("create failed");
  return created.value;
}

function pay(target: Charge, amountMinor: number, key = "s1") {
  return target.registerPayments({
    lines: [{ method: "PIX", amountMinor, installments: null }],
    unitId: "unit",
    userId: "desk",
    submissionId: key,
    receivedAt: NOW,
    now: NOW,
    paymentIds: [`p-${key}`],
  });
}

describe("Charge aggregate", () => {
  it("F09: status follows paid and net amounts", () => {
    const target = charge();
    expect(target.snapshot.status).toBe("OPEN");
    expect(pay(target, 5000, "a").ok).toBe(true);
    expect(target.snapshot.status).toBe("PARTIALLY_PAID");
    expect(pay(target, 15_000, "b").ok).toBe(true);
    expect(target.snapshot.status).toBe("PAID");

    const free = charge(10_000);
    const set = free.setDiscount({
      discount: { kind: "PERCENT", value: 10_000 },
      reason: "Cortesia da casa",
      actor: MANAGER,
      requestId: "r1",
      now: NOW,
    });
    expect(set.ok).toBe(true);
    expect(free.snapshot.netMinor).toBe(0);
    expect(free.snapshot.status).toBe("PAID");

    const waiting = charge();
    waiting.setDiscount({
      discount: { kind: "PERCENT", value: 3000 },
      reason: "Paciente antigo",
      actor: DESK,
      submitForApproval: true,
      requestId: "r2",
      now: NOW,
    });
    expect(waiting.snapshot.status).toBe("PENDING_APPROVAL");
  });

  it("F09: payments are refused while a discount is pending", () => {
    const target = charge();
    target.setDiscount({
      discount: { kind: "PERCENT", value: 2500 },
      reason: "Retorno",
      actor: DESK,
      submitForApproval: true,
      requestId: "r1",
      now: NOW,
    });
    const result = pay(target, 1000);
    expect(!result.ok && result.error.code).toBe("BILLING_DISCOUNT_PENDING_APPROVAL");
  });

  it("F09: a payment above the balance is refused with both amounts", () => {
    const target = charge(20_000);
    const result = pay(target, 25_000);
    expect(!result.ok && result.error.code).toBe("BILLING_PAYMENT_EXCEEDS_BALANCE");
    expect(!result.ok && result.error.params).toEqual({
      amountMinor: 25_000,
      balanceMinor: 20_000,
      currency: "BRL",
    });
    expect(target.snapshot.paidMinor).toBe(0);
  });

  it("F09: a refund moves a paid charge back to partially paid", () => {
    const target = charge(30_000);
    pay(target, 30_000);
    const refund = target.refund({
      paymentId: "p-s1",
      amountMinor: 10_000,
      reason: "Procedimento não realizado",
      unitId: "unit-b",
      userId: "manager",
      now: NOW,
      refundId: "ref-1",
    });
    expect(refund.ok && refund.value.amountMinor).toBe(-10_000);
    expect(target.snapshot.status).toBe("PARTIALLY_PAID");
    expect(target.snapshot.payments.find((payment) => payment.id === "p-s1")?.refundedMinor).toBe(10_000);
    const tooMuch = target.refund({
      paymentId: "p-s1",
      amountMinor: 20_001,
      reason: "Erro",
      unitId: "unit",
      userId: "manager",
      now: NOW,
      refundId: "ref-2",
    });
    expect(!tooMuch.ok && tooMuch.error.code).toBe("BILLING_REFUND_EXCEEDS");
  });

  it("F09: void needs no active payments and a reason", () => {
    const withPayment = charge();
    pay(withPayment, 5000);
    const blocked = withPayment.void({ reason: "Duplicada", userId: "manager", now: NOW });
    expect(!blocked.ok && blocked.error.code).toBe("BILLING_CHARGE_HAS_PAYMENTS");

    withPayment.refund({
      paymentId: "p-s1",
      amountMinor: null,
      reason: "Estorno total",
      unitId: "unit",
      userId: "manager",
      now: NOW,
      refundId: "ref-1",
    });
    const noReason = withPayment.void({ reason: " ", userId: "manager", now: NOW });
    expect(!noReason.ok && noReason.error.code).toBe("BILLING_REASON_REQUIRED");
    expect(withPayment.void({ reason: "Cobrança duplicada", userId: "manager", now: NOW }).ok).toBe(true);
    expect(withPayment.snapshot.status).toBe("CANCELLED");
  });

  it("F09: the discount is locked after a payment", () => {
    const target = charge();
    pay(target, 1000);
    const result = target.setDiscount({
      discount: { kind: "PERCENT", value: 500 },
      reason: null,
      actor: DESK,
      requestId: "r1",
      now: NOW,
    });
    expect(!result.ok && result.error.code).toBe("BILLING_DISCOUNT_LOCKED");
  });

  it("F09: rejecting a discount removes it and reopens the charge", () => {
    const target = charge();
    target.setDiscount({
      discount: { kind: "PERCENT", value: 3000 },
      reason: "Fidelidade",
      actor: DESK,
      submitForApproval: true,
      requestId: "r1",
      now: NOW,
    });
    const noReason = target.rejectPending({ decidedById: "manager", reason: "", now: NOW });
    expect(!noReason.ok && noReason.error.code).toBe("BILLING_REASON_REQUIRED");
    const rejected = target.rejectPending({ decidedById: "manager", reason: "Fora da política", now: NOW });
    expect(rejected.ok).toBe(true);
    expect(target.snapshot.netMinor).toBe(target.snapshot.grossMinor);
    expect(target.snapshot.status).toBe("OPEN");
    expect(target.snapshot.discount).toBeNull();
  });

  it("F09: the reason and approval thresholds decide what the desk can do alone", () => {
    const base = {
      actor: DESK,
      requestId: "r",
      now: NOW,
    };
    const noReason = charge().setDiscount({
      ...base,
      discount: { kind: "PERCENT", value: 1001 },
      reason: null,
    });
    expect(!noReason.ok && noReason.error.code).toBe("BILLING_DISCOUNT_REASON_REQUIRED");
    const tenPercent = charge().setDiscount({
      ...base,
      discount: { kind: "PERCENT", value: 1000 },
      reason: null,
    });
    expect(tenPercent.ok).toBe(true);
    const twenty = charge();
    expect(
      twenty.setDiscount({ ...base, discount: { kind: "PERCENT", value: 2000 }, reason: "Retorno" }).ok,
    ).toBe(true);
    expect(twenty.snapshot.status).toBe("OPEN");
    const above = charge().setDiscount({
      ...base,
      discount: { kind: "PERCENT", value: 2001 },
      reason: "Retorno",
    });
    expect(!above.ok && above.error.code).toBe("BILLING_DISCOUNT_NEEDS_APPROVAL");
  });

  it("F09: a PIN approval or a manager role applies a discount above 20% at once", () => {
    const viaPin = charge();
    const pinned = viaPin.setDiscount({
      discount: { kind: "PERCENT", value: 3000 },
      reason: "Parceria",
      actor: DESK,
      approverUserId: "manager",
      requestId: "r1",
      now: NOW,
    });
    expect(pinned.ok && pinned.value.request).toMatchObject({
      method: "PIN",
      decidedById: "manager",
      requestedById: "desk",
    });
    expect(viaPin.snapshot.status).toBe("OPEN");
    expect(viaPin.snapshot.netMinor).toBe(14_000);

    const viaRole = charge();
    const own = viaRole.setDiscount({
      discount: { kind: "PERCENT", value: 3000 },
      reason: "Parceria",
      actor: MANAGER,
      requestId: "r2",
      now: NOW,
    });
    expect(own.ok && own.value.request?.method).toBe("ROLE");
  });

  it("F09: lowering a pending discount to 20% or less withdraws the request", () => {
    const target = charge();
    target.setDiscount({
      discount: { kind: "PERCENT", value: 3000 },
      reason: "Parceria",
      actor: DESK,
      submitForApproval: true,
      requestId: "r1",
      now: NOW,
    });
    const lowered = target.setDiscount({
      discount: { kind: "PERCENT", value: 2000 },
      reason: "Parceria",
      actor: DESK,
      requestId: "r2",
      now: NOW,
    });
    expect(lowered.ok).toBe(true);
    expect(target.snapshot.pendingRequest).toBeNull();
    expect(target.snapshot.status).toBe("OPEN");
    expect(target.changes.some((c) => c.type === "REQUEST_UPDATED" && c.request.status === "WITHDRAWN")).toBe(
      true,
    );
  });
});
