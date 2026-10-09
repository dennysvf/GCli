import { authorize } from "@/shared/authz/guard";
import { roleCan } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { ROLES } from "@/shared/kernel/roles";
import { parseInput } from "@/shared/kernel/validation";
import { afterPinFailure, isPinLocked, isWeakPin } from "../domain/approval-pin";
import { IdentityErrors } from "./errors";
import type { IdentityDeps } from "./ports";
import { setApprovalPinSchema } from "./schemas";

// Roles that may approve discounts (PRD F09): the ones the matrix gives `billing:approve`.
export const APPROVER_ROLES = ROLES.filter((role) => roleCan(role, "billing:approve"));

// Slows down guessing the current password through the PIN form (same rule as PRD F01 sign-in).
const PASSWORD_ATTEMPTS = { maxFailures: 5, lockMinutes: 15 } as const;

export async function setApprovalPin(
  deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ setAt: string }>> {
  const allowed = await authorize(ctx, "billing:approve");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setApprovalPinSchema, input);
  if (!parsed.ok) return parsed;
  const { currentPassword, pin } = parsed.value;
  if (isWeakPin(pin)) return fail(IdentityErrors.pinWeak());

  const now = deps.clock();
  const key = `pin-set:${ctx.user.id}`;
  if (await deps.rateLimiter.isBlocked(key, now)) return fail(IdentityErrors.rateLimited());
  if (!(await deps.auth.verifyPassword(ctx.user.id, currentPassword))) {
    await deps.rateLimiter.registerFailure(key, PASSWORD_ATTEMPTS, now);
    return fail(IdentityErrors.invalidCredentials());
  }
  await deps.rateLimiter.clear(key);

  const hash = await deps.auth.hashPassword(pin);
  return withTransaction(ctx, async (uow) => {
    const user = await uow.tx.user.findFirst({ where: { id: ctx.user.id } });
    if (!user) return fail(IdentityErrors.userNotFound());
    await uow.tx.user.update({
      where: { id: user.id },
      data: {
        approvalPinHash: hash,
        approvalPinSetAt: now,
        approvalPinFailedCount: 0,
        approvalPinLockedUntil: null,
        version: { increment: 1 },
      },
    });
    // The PIN itself is never written anywhere, not even its hash.
    await uow.audit.record({
      action: "UPDATE",
      entityType: "user",
      entityId: user.id,
      summary: "PIN de aprovação definido",
      metadata: { change: user.approvalPinHash ? "replaced" : "created" },
    });
    return ok({ setAt: now.toISOString() });
  });
}

export type ApproverItem = { id: string; name: string };

// Managers and Administrators with a PIN, for the approval fields of the receive modal.
export async function listApprovers(ctx: RequestContext): Promise<Result<ApproverItem[]>> {
  const allowed = await authorize(ctx, "billing:operate");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const users = await uow.tx.user.findMany({
      where: { status: "ACTIVE", role: { in: [...APPROVER_ROLES] }, approvalPinHash: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return ok(users);
  });
}

type PinVerdict = "OK" | "INVALID" | "LOCKED";

// Checks the approver's PIN in its own transaction so wrong attempts are counted even when the
// operation that asked for the approval fails afterwards. An approver who cannot approve (unknown,
// inactive, no PIN) looks like a wrong PIN, so the form does not reveal which users have one.
export async function verifyApprovalPin(
  deps: IdentityDeps,
  ctx: RequestContext,
  approverUserId: string,
  pin: string,
): Promise<Result<{ approverUserId: string; approverName: string }>> {
  const now = deps.clock();
  const outcome = await withTransaction<{ verdict: PinVerdict; name: string }>(ctx, async (uow) => {
    const denied = (reason: string, extra: Record<string, unknown> = {}) =>
      uow.audit.record({
        action: "PERMISSION_DENIED",
        metadata: { permission: "billing:approve", reason, approverUserId, ...extra },
      });
    await uow.tx.$queryRaw`
      SELECT id FROM app_user
      WHERE id = ${approverUserId}::uuid AND organization_id = ${ctx.organizationId}::uuid FOR UPDATE`;
    const user = await uow.tx.user.findFirst({ where: { id: approverUserId } });
    const pinHash = user?.approvalPinHash ?? null;
    if (!user || !pinHash || user.status !== "ACTIVE" || !APPROVER_ROLES.some((role) => role === user.role)) {
      await denied("APPROVAL_PIN_INVALID");
      return ok({ verdict: "INVALID" as const, name: "" });
    }
    if (isPinLocked(user.approvalPinLockedUntil, now)) {
      await denied("APPROVAL_PIN_LOCKED");
      return ok({ verdict: "LOCKED" as const, name: user.name });
    }
    if (await deps.auth.verifyHash(pinHash, pin)) {
      if (user.approvalPinFailedCount > 0) {
        await uow.tx.user.update({ where: { id: user.id }, data: { approvalPinFailedCount: 0 } });
      }
      return ok({ verdict: "OK" as const, name: user.name });
    }
    const state = afterPinFailure(user.approvalPinFailedCount, now);
    await uow.tx.user.update({
      where: { id: user.id },
      data: { approvalPinFailedCount: state.failedCount, approvalPinLockedUntil: state.lockedUntil },
    });
    await denied("APPROVAL_PIN_INVALID", { locked: state.lockedUntil !== null });
    return ok({ verdict: "INVALID" as const, name: user.name });
  });
  if (!outcome.ok) return outcome;
  const { verdict, name } = outcome.value;
  if (verdict === "OK") return ok({ approverUserId, approverName: name });
  if (verdict === "LOCKED") return fail(IdentityErrors.pinLocked());
  return fail(IdentityErrors.pinInvalid());
}
