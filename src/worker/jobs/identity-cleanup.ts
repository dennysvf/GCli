import { db } from "@/shared/db/client";

// Daily housekeeping (spec F01 section 4): expired sessions, used or expired verification
// tokens, and rate-limit buckets idle for more than 24 hours.
export async function cleanupIdentityData(now = new Date()): Promise<void> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await db().session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db().verification.deleteMany({ where: { expiresAt: { lt: now } } });
  await db().rateLimitBucket.deleteMany({
    where: {
      windowStartedAt: { lt: dayAgo },
      OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }],
    },
  });
}
