import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { BILLING_EVENTS } from "../domain/events";
import type { BillingDeps } from "./ports";
import { decideDiscountSchema, rejectDiscountSchema, setDiscountSchema } from "./schemas";
import { billingEvent, chargeChanges, chargeEventPayload, copyProps, mutateCharge } from "./support";
import {
  chargeView,
  loadNames,
  requestView,
  viewOf,
  type ChargeView,
  type DiscountRequestView,
} from "./views";
import type { DiscountRequestRecord } from "../domain/charge";

export type DiscountOutcome = { charge: ChargeView; request: DiscountRequestView | null };

async function outcomeOf(
  deps: BillingDeps,
  ctx: RequestContext,
  charge: Parameters<typeof viewOf>[2],
  request: DiscountRequestRecord | null,
): Promise<DiscountOutcome> {
  const names = await loadNames(deps.directory, ctx, [
    charge.snapshot,
    ...(request ? [{ ...charge.snapshot, pendingRequest: request }] : []),
  ]);
  return { charge: chargeView(charge, names), request: request ? requestView(request, names) : null };
}

// Applies, replaces or removes the discount of a charge (PRD F09). A discount above 20% is applied
// by a Manager or Administrator, with an approver's PIN, or it waits in the approvals list.
export async function setDiscount(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<DiscountOutcome>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setDiscountSchema, input);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const canApprove = can(ctx, "billing:approve");

  // The PIN is checked first, in its own transaction, so wrong attempts are counted whatever happens next.
  let approverUserId: string | null = null;
  if (data.discount && data.approval && !canApprove) {
    const verified = await deps.approvals.verify(ctx, data.approval.approverUserId, data.approval.pin);
    if (!verified.ok) return verified;
    approverUserId = verified.value.approverUserId;
  }

  const now = deps.clock();
  const changed = await mutateCharge(
    deps,
    ctx,
    data.chargeId,
    { expectedVersion: data.version },
    async (uow, charge) => {
      const before = copyProps(charge);
      const result = charge.setDiscount({
        discount: data.discount,
        reason: data.reason ?? null,
        actor: { userId: ctx.user.id, canApprove },
        approverUserId,
        submitForApproval: data.submitForApproval ?? false,
        requestId: deps.newId(),
        now,
      });
      if (!result.ok) return result;
      const request = result.value.request;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "charge",
        entityId: charge.id,
        summary: data.discount ? "Desconto aplicado" : "Desconto removido",
        changes: chargeChanges(before, charge.snapshot),
        metadata: {
          number: charge.snapshot.number,
          ...(request
            ? { requestId: request.id, requestStatus: request.status, approvalMethod: request.method }
            : {}),
        },
      });
      if (request) {
        const type =
          request.status === "PENDING" ? BILLING_EVENTS.discountRequested : BILLING_EVENTS.discountApproved;
        await uow.publish(billingEvent(type, chargeEventPayload(charge, ctx.user.id), now));
      }
      return ok(request);
    },
  );
  if (!changed.ok) return changed;
  return ok(await outcomeOf(deps, ctx, changed.value.charge, changed.value.value));
}

// PRD F09: the Manager approves from the pending list.
export async function approveDiscount(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ChargeView>> {
  const allowed = await authorize(ctx, "billing:approve");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(decideDiscountSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  const changed = await mutateCharge(
    deps,
    ctx,
    parsed.value.chargeId,
    { expectedVersion: parsed.value.version },
    async (uow, charge) => {
      const before = copyProps(charge);
      const result = charge.approvePending({ decidedById: ctx.user.id, now });
      if (!result.ok) return result;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "charge",
        entityId: charge.id,
        summary: "Desconto aprovado",
        changes: chargeChanges(before, charge.snapshot),
        metadata: {
          number: charge.snapshot.number,
          requestId: result.value.request.id,
          approvalMethod: "LIST",
        },
      });
      await uow.publish(
        billingEvent(BILLING_EVENTS.discountApproved, chargeEventPayload(charge, ctx.user.id), now),
      );
      return ok(undefined);
    },
  );
  if (!changed.ok) return changed;
  return ok(await viewOf(deps.directory, ctx, changed.value.charge));
}

// PRD F09 (interview): a rejection needs a reason, removes the discount and reopens the charge.
export async function rejectDiscount(
  deps: BillingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ChargeView>> {
  const allowed = await authorize(ctx, "billing:approve");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(rejectDiscountSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  const changed = await mutateCharge(
    deps,
    ctx,
    parsed.value.chargeId,
    { expectedVersion: parsed.value.version },
    async (uow, charge) => {
      const before = copyProps(charge);
      const result = charge.rejectPending({ decidedById: ctx.user.id, reason: parsed.value.reason, now });
      if (!result.ok) return result;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "charge",
        entityId: charge.id,
        summary: "Desconto rejeitado",
        changes: chargeChanges(before, charge.snapshot),
        metadata: { number: charge.snapshot.number, requestId: result.value.request.id },
      });
      await uow.publish(
        billingEvent(BILLING_EVENTS.discountRejected, chargeEventPayload(charge, ctx.user.id), now),
      );
      return ok(undefined);
    },
  );
  if (!changed.ok) return changed;
  return ok(await viewOf(deps.directory, ctx, changed.value.charge));
}

export type PendingApproval = { charge: ChargeView; request: DiscountRequestView };

export async function listPendingApprovals(
  deps: BillingDeps,
  ctx: RequestContext,
): Promise<Result<PendingApproval[]>> {
  const allowed = await authorize(ctx, "billing:approve");
  if (!allowed.ok) return allowed;
  const pending = await withTransaction(ctx, async (uow) => ok(await deps.reads.listPending(uow)));
  if (!pending.ok) return pending;
  const names = await loadNames(deps.directory, ctx, pending.value);
  const items: PendingApproval[] = [];
  for (const props of pending.value) {
    if (!props.pendingRequest) continue;
    items.push({ charge: chargeView(props, names), request: requestView(props.pendingRequest, names) });
  }
  return ok(items);
}

export async function countPendingApprovals(deps: BillingDeps, ctx: RequestContext): Promise<number> {
  if (!can(ctx, "billing:approve")) return 0;
  const counted = await withTransaction(ctx, async (uow) => ok(await deps.reads.countPending(uow)));
  return counted.ok ? counted.value : 0;
}
