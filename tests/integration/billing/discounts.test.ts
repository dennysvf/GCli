import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { billing } from "@/modules/billing";
import { identity } from "@/modules/identity";
import { db } from "@/shared/db/client";
import { closeHelpers, DEFAULT_PASSWORD, resetDatabase } from "../helpers";
import { billingWorld, manualCharge, MANAGER_PIN, receive, type BillingWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

const percent = (value: number) => ({ kind: "PERCENT" as const, value });

async function setDiscount(
  ctx: BillingWorld["desk"],
  charge: { id: string; version: number },
  discount: { kind: "PERCENT" | "AMOUNT"; value: number } | null,
  extra: Record<string, unknown> = {},
) {
  return billing.setDiscount(ctx, { chargeId: charge.id, version: charge.version, discount, ...extra });
}

describe("discounts and approvals", () => {
  it("F09: front desk applies a 20% discount; above 20% the charge waits for approval and cannot receive payments", async () => {
    const charge = await manualCharge(world, 20_000);
    const twenty = await setDiscount(world.desk, charge, percent(2000), { reason: "Paciente de retorno" });
    expect(twenty.ok && twenty.value.charge).toMatchObject({
      status: "OPEN",
      discountMinor: 4000,
      netMinor: 16_000,
    });

    const other = await manualCharge(world, 20_000);
    const noPath = await setDiscount(world.desk, other, percent(2500), { reason: "Parceria" });
    expect(!noPath.ok && noPath.error.code).toBe("BILLING_DISCOUNT_NEEDS_APPROVAL");

    const pending = await setDiscount(world.desk, other, percent(2500), {
      reason: "Parceria",
      submitForApproval: true,
    });
    expect(pending.ok && pending.value.charge.status).toBe("PENDING_APPROVAL");
    const refused = await receive(world, other.id, [{ method: "PIX", amountMinor: 1000 }]);
    expect(!refused.ok && refused.error.code).toBe("BILLING_DISCOUNT_PENDING_APPROVAL");

    const approvals = await billing.listPendingApprovals(world.manager);
    expect(approvals.ok && approvals.value.map((item) => item.charge.id)).toEqual([other.id]);
    const approved = await billing.approveDiscount(world.manager, { chargeId: other.id });
    expect(approved.ok && approved.value).toMatchObject({
      status: "OPEN",
      discountMinor: 5000,
      netMinor: 15_000,
    });
    expect((await receive(world, other.id, [{ method: "PIX", amountMinor: 15_000 }])).ok).toBe(true);
    expect(
      await db().chargeDiscountRequest.findFirstOrThrow({ where: { chargeId: other.id } }),
    ).toMatchObject({
      status: "APPROVED",
      method: "LIST",
      requestedById: world.desk.user.id,
      decidedById: world.manager.user.id,
    });
  });

  it("F09: a discount above 10% cannot be saved without a reason", async () => {
    const charge = await manualCharge(world, 20_000);
    const missing = await setDiscount(world.desk, charge, percent(1001));
    expect(!missing.ok && missing.error.code).toBe("BILLING_DISCOUNT_REASON_REQUIRED");
    const blank = await setDiscount(world.desk, charge, percent(1500), { reason: "  " });
    expect(!blank.ok && blank.error.code).toBe("BILLING_DISCOUNT_REASON_REQUIRED");
    const ten = await setDiscount(world.desk, charge, percent(1000));
    expect(ten.ok).toBe(true);
  });

  it("F09: inline approval with a manager PIN approves the discount and records both users", async () => {
    const charge = await manualCharge(world, 20_000);
    const result = await setDiscount(world.desk, charge, percent(3000), {
      reason: "Convênio informal",
      approval: { approverUserId: world.manager.user.id, pin: MANAGER_PIN },
    });
    expect(result.ok && result.value.charge).toMatchObject({ status: "OPEN", netMinor: 14_000 });
    expect(
      await db().chargeDiscountRequest.findFirstOrThrow({ where: { chargeId: charge.id } }),
    ).toMatchObject({
      status: "APPROVED",
      method: "PIN",
      requestedById: world.desk.user.id,
      decidedById: world.manager.user.id,
    });
  });

  it("F09: a wrong PIN is counted even though the discount is not saved, and locks after 5 failures", async () => {
    const charge = await manualCharge(world, 20_000);
    const attempt = (pin: string) =>
      setDiscount(world.desk, charge, percent(3000), {
        reason: "Convênio",
        approval: { approverUserId: world.manager.user.id, pin },
      });
    for (let index = 0; index < 5; index++) {
      const wrong = await attempt("999000");
      expect(!wrong.ok && wrong.error.code).toBe("APPROVAL_PIN_INVALID");
    }
    const locked = await attempt(MANAGER_PIN);
    expect(!locked.ok && locked.error.code).toBe("APPROVAL_PIN_LOCKED");
    const denials = await db().auditEvent.count({ where: { action: "PERMISSION_DENIED" } });
    expect(denials).toBeGreaterThanOrEqual(6);
    expect((await db().charge.findUniqueOrThrow({ where: { id: charge.id } })).discountMinor).toBe(0n);
    // An unknown approver looks like a wrong PIN.
    const stranger = await setDiscount(world.desk, charge, percent(3000), {
      reason: "Convênio",
      approval: { approverUserId: world.pro.user.id, pin: MANAGER_PIN },
    });
    expect(!stranger.ok && stranger.error.code).toBe("APPROVAL_PIN_INVALID");
  });

  it("F09: setting a PIN needs the current password, refuses weak PINs and is cleared on deactivation", async () => {
    const wrongPassword = await identity.setApprovalPin(world.manager, {
      currentPassword: "senhaErrada99",
      pin: "135792",
      confirmation: "135792",
    });
    expect(!wrongPassword.ok && wrongPassword.error.code).toBe("AUTH_INVALID_CREDENTIALS");
    const weak = await identity.setApprovalPin(world.manager, {
      currentPassword: DEFAULT_PASSWORD,
      pin: "123456",
      confirmation: "123456",
    });
    expect(!weak.ok && weak.error.code).toBe("APPROVAL_PIN_WEAK");
    const forbidden = await identity.setApprovalPin(world.desk, {
      currentPassword: DEFAULT_PASSWORD,
      pin: "135792",
      confirmation: "135792",
    });
    expect(!forbidden.ok && forbidden.error.code).toBe("AUTHZ_FORBIDDEN");
    const approvers = await identity.listApprovers(world.desk);
    expect(approvers.ok && approvers.value.map((item) => item.id)).toEqual([world.manager.user.id]);

    const deactivated = await identity.deactivateUser(world.admin, { userId: world.manager.user.id });
    expect(deactivated.ok).toBe(true);
    const row = await db().user.findUniqueOrThrow({ where: { id: world.manager.user.id } });
    expect(row.approvalPinHash).toBeNull();
    const none = await identity.listApprovers(world.desk);
    expect(none.ok && none.value).toEqual([]);
  });

  it("F09: a manager's own discount above 20% is approved at once", async () => {
    const charge = await manualCharge(world, 20_000);
    const result = await setDiscount(world.manager, charge, percent(4000), {
      reason: "Cortesia da diretoria",
    });
    expect(result.ok && result.value.charge.status).toBe("OPEN");
    expect(
      await db().chargeDiscountRequest.findFirstOrThrow({ where: { chargeId: charge.id } }),
    ).toMatchObject({
      status: "APPROVED",
      method: "ROLE",
    });
  });

  it("F09: lowering a pending discount to 20% or less withdraws the request", async () => {
    const charge = await manualCharge(world, 20_000);
    const pending = await setDiscount(world.desk, charge, percent(3000), {
      reason: "Parceria",
      submitForApproval: true,
    });
    const version = pending.ok ? pending.value.charge.version : charge.version;
    const lowered = await setDiscount(world.desk, { id: charge.id, version }, percent(2000), {
      reason: "Parceria",
    });
    expect(lowered.ok && lowered.value.charge).toMatchObject({ status: "OPEN", netMinor: 16_000 });
    expect(
      await db().chargeDiscountRequest.findFirstOrThrow({ where: { chargeId: charge.id } }),
    ).toMatchObject({
      status: "WITHDRAWN",
    });
    const list = await billing.listPendingApprovals(world.manager);
    expect(list.ok && list.value).toEqual([]);
  });

  it("F09: rejecting needs a reason and reopens the charge without discount", async () => {
    const charge = await manualCharge(world, 20_000);
    await setDiscount(world.desk, charge, percent(3000), { reason: "Parceria", submitForApproval: true });
    const noReason = await billing.rejectDiscount(world.manager, { chargeId: charge.id, reason: "" });
    expect(!noReason.ok && noReason.error.code).toBe("BILLING_REASON_REQUIRED");
    const rejected = await billing.rejectDiscount(world.manager, {
      chargeId: charge.id,
      reason: "Fora da política",
    });
    expect(rejected.ok && rejected.value).toMatchObject({
      status: "OPEN",
      discountMinor: 0,
      netMinor: 20_000,
    });
    expect((await receive(world, charge.id, [{ method: "PIX", amountMinor: 20_000 }])).ok).toBe(true);
    const front = await billing.rejectDiscount(world.desk, {
      chargeId: charge.id,
      reason: "Fora da política",
    });
    expect(!front.ok && front.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F09: the discount cannot change once the charge has payments", async () => {
    const charge = await manualCharge(world, 20_000);
    const paid = await receive(world, charge.id, [{ method: "PIX", amountMinor: 1000 }]);
    const version = paid.ok ? paid.value.charge.version : 1;
    const locked = await setDiscount(world.desk, { id: charge.id, version }, percent(500));
    expect(!locked.ok && locked.error.code).toBe("BILLING_DISCOUNT_LOCKED");
  });
});
