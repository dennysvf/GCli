import { createHash } from "node:crypto";
import { db } from "@/shared/db/client";

// Fixed-window counters stored in PostgreSQL (architecture section 7; no Redis). The caller
// passes `now` so behavior is testable with a controlled clock.
export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  // PRD F01 / spec section 3: sign-in 20 per 15 min per IP.
  signInPerIp: { limit: 20, windowSeconds: 15 * 60 },
  // Password reset: 5 per hour per email and 20 per hour per IP.
  resetPerEmail: { limit: 5, windowSeconds: 60 * 60 },
  resetPerIp: { limit: 20, windowSeconds: 60 * 60 },
  // Invitation acceptance: 20 per 15 min per IP.
  acceptInvitationPerIp: { limit: 20, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateLimitRule>;

export function hashKey(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

// Counts one attempt and reports whether it is still within the limit.
export async function consume(key: string, rule: RateLimitRule, now: Date): Promise<boolean> {
  const windowStart = new Date(now.getTime() - rule.windowSeconds * 1000);
  const rows = await db().$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_bucket (key, count, window_started_at)
    VALUES (${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_bucket.window_started_at <= ${windowStart} THEN 1 ELSE rate_limit_bucket.count + 1 END,
      window_started_at = CASE WHEN rate_limit_bucket.window_started_at <= ${windowStart} THEN ${now} ELSE rate_limit_bucket.window_started_at END
    RETURNING count`;
  return (rows[0]?.count ?? 1) <= rule.limit;
}

// Consecutive-failure lock for keys that have no user row (unknown emails), so the lock message
// cannot be used to discover which emails exist (spec F01 section 3).
export async function isBlocked(key: string, now: Date): Promise<boolean> {
  const bucket = await db().rateLimitBucket.findUnique({ where: { key } });
  return !!bucket?.blockedUntil && bucket.blockedUntil > now;
}

export async function registerFailure(
  key: string,
  options: { maxFailures: number; lockMinutes: number },
  now: Date,
): Promise<{ locked: boolean }> {
  const rows = await db().$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limit_bucket (key, count, window_started_at)
    VALUES (${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit_bucket.blocked_until IS NOT NULL AND rate_limit_bucket.blocked_until <= ${now}
                   THEN 1 ELSE rate_limit_bucket.count + 1 END,
      blocked_until = CASE WHEN rate_limit_bucket.blocked_until IS NOT NULL AND rate_limit_bucket.blocked_until <= ${now}
                   THEN NULL ELSE rate_limit_bucket.blocked_until END
    RETURNING count`;
  const count = rows[0]?.count ?? 1;
  if (count < options.maxFailures) return { locked: false };
  await db().rateLimitBucket.update({
    where: { key },
    data: { blockedUntil: new Date(now.getTime() + options.lockMinutes * 60_000) },
  });
  return { locked: true };
}

export async function clear(key: string): Promise<void> {
  await db().rateLimitBucket.deleteMany({ where: { key } });
}
