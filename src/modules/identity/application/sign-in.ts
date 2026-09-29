import { createHash } from "node:crypto";
import type { SystemContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { Role } from "@/shared/kernel/roles";
import { parseInput } from "@/shared/kernel/validation";
import { safeRedirectPath } from "@/shared/security/safe-redirect";
import { isLocked, LOCK_MINUTES, MAX_FAILED_SIGN_INS } from "../domain/policies";
import { IdentityErrors } from "./errors";
import type { IdentityDeps, IdentityUser, RequestMeta } from "./ports";
import { signInSchema } from "./schemas";

// PRD F01 / spec section 3: role-based home after sign-in.
export function homeFor(role: Role): string {
  return role === "ADMINISTRATOR" || role === "MANAGER" ? "/dashboard" : "/schedule";
}

// Spec section 3: sign-in 20 attempts per 15 minutes per IP.
const RATE_RULES = {
  signInPerIp: { limit: 20, windowSeconds: 15 * 60 },
};

type FailureReason = "bad_password" | "locked" | "inactive" | "unknown_email";

function anonymousContext(meta: RequestMeta, organizationId: string | null): SystemContext {
  return {
    kind: "anonymous",
    requestId: meta.requestId,
    organizationId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  };
}

async function auditFailure(
  meta: RequestMeta,
  now: Date,
  user: IdentityUser | null,
  reason: FailureReason,
  lock = false,
) {
  const lockUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
  await withTransaction(anonymousContext(meta, user?.organizationId ?? null), async (uow) => {
    if (user && reason === "bad_password") {
      // Atomic increment; a lock that has already expired restarts the count (PRD F01).
      await uow.tx.$executeRaw`
        UPDATE app_user SET
          failed_login_count = CASE WHEN locked_until IS NOT NULL AND locked_until <= ${now} THEN 1 ELSE failed_login_count + 1 END,
          locked_until = CASE
            WHEN locked_until IS NOT NULL AND locked_until <= ${now} THEN NULL
            WHEN failed_login_count + 1 >= ${MAX_FAILED_SIGN_INS} THEN ${lockUntil}
            ELSE locked_until END,
          updated_at = ${now}
        WHERE id = ${user.id}::uuid`;
    }
    await uow.audit.record({
      action: "LOGIN_FAILED",
      entityType: user ? "user" : undefined,
      entityId: user?.id,
      actorUserId: user?.id ?? null,
      metadata: { reason, ...(lock ? { locked: true } : {}) },
    });
    return ok(undefined);
  });
}

export type SignInOutput = { redirectTo: string; setCookies: string[] };

export async function signIn(
  deps: IdentityDeps,
  input: unknown,
  meta: RequestMeta,
): Promise<Result<SignInOutput>> {
  const parsed = parseInput(signInSchema, input);
  if (!parsed.ok) return parsed;
  const { email, password, next } = parsed.value;
  const now = deps.clock();

  if (
    meta.ipAddress &&
    !(await deps.rateLimiter.consume(`signin:ip:${meta.ipAddress}`, RATE_RULES.signInPerIp, now))
  ) {
    return fail(IdentityErrors.rateLimited());
  }

  const user = await deps.directory.findUserByEmail(email);

  if (!user) {
    // Unknown emails follow the same lock rule so the lock message reveals nothing (spec section 3).
    const key = `signin:email:${createHash("sha256").update(email).digest("hex")}`;
    if (await deps.rateLimiter.isBlocked(key, now)) {
      await auditFailure(meta, now, null, "unknown_email", true);
      return fail(IdentityErrors.accountLocked());
    }
    await deps.auth.equalizeTiming(password);
    await deps.rateLimiter.registerFailure(
      key,
      { maxFailures: MAX_FAILED_SIGN_INS, lockMinutes: LOCK_MINUTES },
      now,
    );
    await auditFailure(meta, now, null, "unknown_email");
    return fail(IdentityErrors.invalidCredentials());
  }

  if (isLocked(user.lockedUntil, now)) {
    await auditFailure(meta, now, user, "locked", true);
    return fail(IdentityErrors.accountLocked());
  }

  if (user.status !== "ACTIVE") {
    await deps.auth.equalizeTiming(password);
    await auditFailure(meta, now, user, "inactive");
    return fail(IdentityErrors.invalidCredentials());
  }

  const result = await deps.auth.signIn(email, password, meta);
  if (!result.ok) {
    await auditFailure(meta, now, user, "bad_password");
    return fail(IdentityErrors.invalidCredentials());
  }

  await withTransaction(anonymousContext(meta, user.organizationId), async (uow) => {
    await uow.tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await uow.audit.record({ action: "LOGIN", entityType: "user", entityId: user.id, actorUserId: user.id });
    return ok(undefined);
  });

  return ok({ redirectTo: safeRedirectPath(next) ?? homeFor(user.role), setCookies: result.setCookies });
}
