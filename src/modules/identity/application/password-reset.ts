import type { SystemContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { IdentityErrors } from "./errors";
import type { IdentityDeps, RequestMeta } from "./ports";
import { requestPasswordResetSchema, resetPasswordSchema } from "./schemas";

// Spec section 3: password reset 5 per hour per email and 20 per hour per IP.
const RESET_PER_EMAIL = { limit: 5, windowSeconds: 60 * 60 };
const RESET_PER_IP = { limit: 20, windowSeconds: 60 * 60 };

function context(meta: RequestMeta, organizationId: string): SystemContext {
  return {
    kind: "anonymous",
    requestId: meta.requestId,
    organizationId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  };
}

// The response is identical whether the email exists or not (PRD F01).
export async function requestPasswordReset(
  deps: IdentityDeps,
  input: unknown,
  meta: RequestMeta,
): Promise<Result<{ requested: true }>> {
  const parsed = parseInput(requestPasswordResetSchema, input);
  if (!parsed.ok) return parsed;
  const { email } = parsed.value;
  const now = deps.clock();

  const withinIp =
    !meta.ipAddress || (await deps.rateLimiter.consume(`reset:ip:${meta.ipAddress}`, RESET_PER_IP, now));
  const withinEmail = await deps.rateLimiter.consume(`reset:email:${email}`, RESET_PER_EMAIL, now);
  if (!withinIp || !withinEmail) return fail(IdentityErrors.rateLimited());

  const user = await deps.directory.findUserByEmail(email);
  if (user && user.status === "ACTIVE") {
    // Better Auth creates the single-use token and calls sendResetPassword, which writes the
    // outbox message (identity/infrastructure/auth.ts).
    await deps.auth.requestPasswordReset(email);
    await withTransaction(context(meta, user.organizationId), async (uow) => {
      await uow.audit.record({
        action: "PASSWORD_RESET_REQUESTED",
        entityType: "user",
        entityId: user.id,
        actorUserId: user.id,
      });
      return ok(undefined);
    });
  }
  return ok({ requested: true });
}

export async function resetPassword(
  deps: IdentityDeps,
  input: unknown,
  meta: RequestMeta,
): Promise<Result<{ redirectTo: string }>> {
  const parsed = parseInput(resetPasswordSchema, input);
  if (!parsed.ok) return parsed;
  const { token, password } = parsed.value;

  const userId = await deps.directory.findResetTokenUserId(token);
  if (!userId) return fail(IdentityErrors.linkInvalid());
  const user = await deps.directory.findUserById(userId);
  if (!user || user.status !== "ACTIVE") return fail(IdentityErrors.linkInvalid());

  // Consumes the token (single use, 60-minute expiry) and revokes every session of the user.
  if (!(await deps.auth.resetPassword(token, password))) return fail(IdentityErrors.linkInvalid());

  await withTransaction(context(meta, user.organizationId), async (uow) => {
    await uow.tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
    await uow.audit.record({
      action: "PASSWORD_RESET",
      entityType: "user",
      entityId: user.id,
      actorUserId: user.id,
    });
    return ok(undefined);
  });
  return ok({ redirectTo: "/login?reset=success" });
}
