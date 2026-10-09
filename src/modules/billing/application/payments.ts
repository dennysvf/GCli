import { authorize, recordDenial } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { formatDate, formatLocale } from "@/shared/i18n/format";
import { addDays } from "@/shared/kernel/calendar-date";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { zonedTimeToUtc } from "@/shared/kernel/zoned-time";
import type { PaymentRecord } from "../domain/charge";
import { BillingErrors } from "../domain/errors";
import { BILLING_EVENTS } from "../domain/events";
import { BACKDATE_DAYS, MAX_INSTALLMENTS, MIN_INSTALLMENTS } from "../domain/limits";
import { enabledMethods } from "./payment-methods";
import type { BillingDeps, UnitInfo } from "./ports";
import { receivePaymentSchema, refundSchema, voidSchema } from "./schemas";
import {
  billingEvent,
  chargeChanges,
  chargeEventPayload,
  copyProps,
  mutateCharge,
  withMoneyText,
} from "./support";
import { chargeView, loadNames, viewOf, type ChargeView, type PaymentView } from "./views";

export type ReceiveResult = {
  charge: ChargeView;
  payments: PaymentView[];
  replayed: boolean;
  receiptUrl: string;
};

const CLOCK_TOLERANCE_MS = 60_000;

export const receiptUrlOf = (chargeId: string) => `/api/billing/charges/${chargeId}/receipt`;

// Earliest instant a manager may date a payment: the start of the day 7 days ago in the unit's zone.
export function earliestPaymentDate(now: Date, timeZone: string): Date {
  const today = dateInTimeZone(now, timeZone);
  return zonedTimeToUtc(`${addDays(today, -BACKDATE_DAYS)}T00:00`, timeZone);
}

function paymentEvent(
  charge: { snapshot: { id: string; patientId: string; currency: string } },
  payment: PaymentRecord,
  actorUserId: string,
  type: string,
  now: Date,
) {
  return billingEvent(
    type,
    {
      chargeId: charge.snapshot.id,
      paymentId: payment.id,
      patientId: charge.snapshot.patientId,
      unitId: payment.unitId,
      method: payment.method,
      amountMinor: payment.amountMinor,
      currency: charge.snapshot.currency,
      receivedAt: payment.receivedAt.toISOString(),
      actorUserId,
    },
    now,
  );
}

// One submission of the receive modal (PRD F09): an optional discount and one or more payment
// lines, all or nothing. The charge row lock serializes concurrent receivers, so the balance
// check is exact and a repeated submission key returns what the first one recorded.
export async function receivePayment(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ReceiveResult>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(receivePaymentSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;

  const unit = await deps.directory.unit(ctx, data.unitId);
  if (!unit || !unit.active) return fail(BillingErrors.unitRequired());
  const canApprove = can(ctx, "billing:approve");
  const now = deps.clock();

  // PRD F09: only Managers and Administrators may date a payment, up to 7 days back.
  let receivedAt = now;
  if (data.receivedAt) {
    if (!canApprove) {
      await recordDenial(ctx, "billing:approve");
      return fail(BillingErrors.backdateForbidden());
    }
    const requested = new Date(data.receivedAt);
    const earliest = earliestPaymentDate(now, unit.timeZone);
    if (requested.getTime() > now.getTime() + CLOCK_TOLERANCE_MS || requested < earliest) {
      const min = formatDate(earliest, formatLocale(ctx.locale, unit.country), unit.timeZone);
      return fail(BillingErrors.paymentDateInvalid(min));
    }
    receivedAt = requested;
  }

  // The approver's PIN is verified in its own transaction, so wrong attempts are counted.
  let approverUserId: string | null = null;
  if (data.discount && data.approval && !canApprove) {
    const verified = await deps.approvals.verify(ctx, data.approval.approverUserId, data.approval.pin);
    if (!verified.ok) return verified;
    approverUserId = verified.value.approverUserId;
  }

  const outcome = await withTransaction(ctx, async (uow) => {
    const charge = await deps.charges.findById(uow, ctx.organizationId, data.chargeId, { lock: true });
    if (!charge) return fail(BillingErrors.chargeNotFound());

    const earlier = await deps.charges.findSubmission(uow, data.submissionKey);
    if (earlier) {
      if (earlier.chargeId !== charge.id) return fail(BillingErrors.chargeNotFound());
      const recorded = charge.snapshot.payments.filter(
        (payment) => payment.submissionId === data.submissionKey,
      );
      return ok({ charge, recorded, replayed: true });
    }
    if (
      data.discount !== undefined &&
      data.version !== undefined &&
      charge.snapshot.version !== data.version
    ) {
      return fail(BillingErrors.chargeStale());
    }
    if (unit.currency !== charge.snapshot.currency) {
      return fail(BillingErrors.currencyMismatch(unit.currency, charge.snapshot.currency));
    }

    const methods = await enabledMethods(uow, unit.country);
    for (const line of data.payments) {
      if (!methods.includes(line.method)) return fail(BillingErrors.paymentMethodInvalid());
      const installments = line.installments;
      if (line.method === "CREDIT_CARD") {
        if (
          installments === undefined ||
          installments < MIN_INSTALLMENTS ||
          installments > MAX_INSTALLMENTS
        ) {
          return fail(BillingErrors.installmentsInvalid());
        }
      } else if (installments !== undefined) {
        return fail(BillingErrors.installmentsInvalid());
      }
    }

    const before = copyProps(charge);
    if (data.discount !== undefined) {
      const applied = charge.setDiscount({
        discount: data.discount,
        reason: data.discountReason ?? null,
        actor: { userId: ctx.user.id, canApprove },
        approverUserId,
        requestId: deps.newId(),
        now,
      });
      if (!applied.ok) return applied;
    }

    const gate = await deps.cashRegister().assertOpen(uow, {
      organizationId: ctx.organizationId,
      unitId: unit.id,
      unitName: unit.name,
      at: receivedAt,
    });
    if (!gate.ok) return gate;

    const registered = charge.registerPayments({
      lines: data.payments.map((line) => ({
        method: line.method,
        amountMinor: line.amountMinor,
        installments: line.installments ?? null,
      })),
      unitId: unit.id,
      userId: ctx.user.id,
      submissionId: data.submissionKey,
      receivedAt,
      now,
      paymentIds: data.payments.map(() => deps.newId()),
    });
    if (!registered.ok) return registered;

    await deps.charges.insertSubmission(uow, {
      organizationId: ctx.organizationId,
      id: data.submissionKey,
      chargeId: charge.id,
      userId: ctx.user.id,
    });
    if ((await deps.charges.save(uow, charge)) === "STALE") return fail(BillingErrors.chargeStale());

    const total = registered.value.reduce((sum, payment) => sum + payment.amountMinor, 0);
    if (data.discount !== undefined) {
      await uow.audit.record({
        action: "UPDATE",
        entityType: "charge",
        entityId: charge.id,
        summary: data.discount ? "Desconto aplicado no recebimento" : "Desconto removido no recebimento",
        changes: chargeChanges(before, charge.snapshot),
        metadata: { number: charge.snapshot.number },
      });
    }
    await uow.audit.record({
      action: "CREATE",
      entityType: "payment",
      entityId: registered.value[0]?.id,
      summary: "Pagamento registrado",
      metadata: {
        chargeId: charge.id,
        number: charge.snapshot.number,
        paymentIds: registered.value.map((payment) => payment.id),
        totalMinor: total,
        currency: charge.snapshot.currency,
        unitId: unit.id,
        methods: registered.value.map((payment) => payment.method),
        backdated: data.receivedAt ? receivedAt.toISOString() : null,
      },
    });
    for (const payment of registered.value) {
      await uow.publish(paymentEvent(charge, payment, ctx.user.id, BILLING_EVENTS.paymentRegistered, now));
    }
    return ok({ charge, recorded: registered.value, replayed: false });
  });
  if (!outcome.ok) return withMoneyText(outcome, ctx.locale, unit.country);

  const { charge, recorded, replayed } = outcome.value;
  const names = await loadNames(deps.directory, ctx, [charge.snapshot]);
  const view = chargeView(charge, names);
  const ids = new Set(recorded.map((payment) => payment.id));
  return ok({
    charge: view,
    payments: view.payments.filter((payment) => ids.has(payment.id)),
    replayed,
    receiptUrl: receiptUrlOf(charge.id),
  });
}

// PRD F09: a refund is a negative movement dated today, in the unit selected now; the original
// payment is kept. Managers and Administrators only, with a reason.
export async function refundPayment(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ charge: ChargeView; refund: PaymentView }>> {
  const allowed = await authorize(ctx, "billing:approve");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(refundSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const unit: UnitInfo | null = await deps.directory.unit(ctx, data.unitId);
  if (!unit || !unit.active) return fail(BillingErrors.unitRequired());
  const now = deps.clock();

  const changed = await mutateCharge(
    deps,
    ctx,
    data.chargeId,
    { expectedVersion: data.version },
    async (uow, charge) => {
      if (unit.currency !== charge.snapshot.currency) {
        return fail(BillingErrors.currencyMismatch(unit.currency, charge.snapshot.currency));
      }
      const gate = await deps.cashRegister().assertOpen(uow, {
        organizationId: ctx.organizationId,
        unitId: unit.id,
        unitName: unit.name,
        at: now,
      });
      if (!gate.ok) return gate;
      const before = copyProps(charge);
      const refunded = charge.refund({
        paymentId: data.paymentId,
        amountMinor: data.amountMinor ?? null,
        reason: data.reason,
        unitId: unit.id,
        userId: ctx.user.id,
        now,
        refundId: deps.newId(),
      });
      if (!refunded.ok) return refunded;
      await uow.audit.record({
        action: "CREATE",
        entityType: "payment",
        entityId: refunded.value.id,
        summary: "Estorno registrado",
        changes: chargeChanges(before, charge.snapshot),
        metadata: {
          chargeId: charge.id,
          number: charge.snapshot.number,
          refundedPaymentId: data.paymentId,
          amountMinor: refunded.value.amountMinor,
          currency: charge.snapshot.currency,
          unitId: unit.id,
        },
      });
      await uow.publish(
        paymentEvent(charge, refunded.value, ctx.user.id, BILLING_EVENTS.paymentRefunded, now),
      );
      return ok(refunded.value);
    },
  );
  if (!changed.ok) return withMoneyText(changed, ctx.locale, unit.country);
  const view = await viewOf(deps.directory, ctx, changed.value.charge);
  const refund = view.payments.find((payment) => payment.id === changed.value.value.id);
  if (!refund) return fail(BillingErrors.paymentNotFound());
  return ok({ charge: view, refund });
}

// PRD F09: a charge can be voided only without active payments, with a reason.
export async function voidCharge(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ChargeView>> {
  const allowed = await authorize(ctx, "billing:approve");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(voidSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  const changed = await mutateCharge(
    deps,
    ctx,
    parsed.value.chargeId,
    { expectedVersion: parsed.value.version },
    async (uow, charge) => {
      const before = copyProps(charge);
      const voided = charge.void({ reason: parsed.value.reason, userId: ctx.user.id, now });
      if (!voided.ok) return voided;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "charge",
        entityId: charge.id,
        summary: "Cobrança cancelada",
        changes: chargeChanges(before, charge.snapshot),
        metadata: { number: charge.snapshot.number },
      });
      await uow.publish(
        billingEvent(BILLING_EVENTS.chargeVoided, chargeEventPayload(charge, ctx.user.id), now),
      );
      return ok(undefined);
    },
  );
  if (!changed.ok) return changed;
  return ok(await viewOf(deps.directory, ctx, changed.value.charge));
}

// For F10: cancelling a package voids its sale charge in the same transaction when no payment was
// received. A charge with payments is left to the refund flow (F09), and `voided` says so.
export async function voidChargeIn(
  deps: BillingDeps,
  ctx: RequestContext,
  uow: UnitOfWork,
  input: { chargeId: string; reason: string },
): Promise<Result<{ voided: boolean }>> {
  const allowed = await authorize(ctx, "billing:approve");
  if (!allowed.ok) return allowed;
  const charge = await deps.charges.findById(uow, ctx.organizationId, input.chargeId, { lock: true });
  if (!charge) return fail(BillingErrors.chargeNotFound());
  if (charge.snapshot.cancelledAt || charge.snapshot.paidMinor > 0) return ok({ voided: false });
  const now = deps.clock();
  const before = copyProps(charge);
  const voided = charge.void({ reason: input.reason, userId: ctx.user.id, now });
  if (!voided.ok) return voided;
  if ((await deps.charges.save(uow, charge)) === "STALE") return fail(BillingErrors.chargeStale());
  await uow.audit.record({
    action: "UPDATE",
    entityType: "charge",
    entityId: charge.id,
    summary: "Cobrança cancelada com o pacote",
    changes: chargeChanges(before, charge.snapshot),
    metadata: { number: charge.snapshot.number },
  });
  await uow.publish(billingEvent(BILLING_EVENTS.chargeVoided, chargeEventPayload(charge, ctx.user.id), now));
  return ok({ voided: true });
}
