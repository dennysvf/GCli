import * as Sentry from "@sentry/node";
import { PgBoss } from "pg-boss";
import { ensureAuditPartitions } from "@/modules/audit";
import { getEnv } from "@/shared/config/env";
import { createSmtpEmailSender } from "@/shared/email/email-sender";
import { QUEUES, type EmailJobData } from "@/shared/jobs/queues";
import { logger } from "@/shared/logging/logger";
import { sentryOptions } from "@/shared/observability/sentry";
import { cleanupIdentityData } from "./jobs/identity-cleanup";
import { sendOutboxEmail } from "./jobs/email-send";
import { startOutboxLoop } from "./outbox-dispatcher";

// Worker process (architecture section 2): outbox delivery, email sending, and maintenance crons.
async function main() {
  const env = getEnv();
  Sentry.init(sentryOptions(env.SENTRY_DSN, env.NODE_ENV));
  // The pgboss schema is created by migration 0001 (owned by the runtime role), which has no
  // CREATE privilege on the database.
  const boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: "pgboss", createSchema: false });
  boss.on("error", (error) => {
    logger.error({ err: error }, "pg-boss error");
    Sentry.captureException(error);
  });
  await boss.start();

  for (const queue of Object.values(QUEUES)) await boss.createQueue(queue);

  const sender = createSmtpEmailSender();
  await boss.work<EmailJobData>(QUEUES.emailSend, async (jobs) => {
    for (const job of jobs) await sendOutboxEmail(job.data, sender);
  });

  await boss.work(QUEUES.auditEnsurePartitions, async () => {
    const created = await ensureAuditPartitions(env.DATABASE_MIGRATION_URL);
    if (created.length) logger.info({ created }, "audit partitions created");
  });
  await boss.work(QUEUES.identityCleanup, async () => cleanupIdentityData());

  // Monthly on day 1 at 03:00, and daily at 03:30 (server time).
  await boss.schedule(QUEUES.auditEnsurePartitions, "0 3 1 * *");
  await boss.schedule(QUEUES.identityCleanup, "30 3 * * *");
  await boss.send(QUEUES.auditEnsurePartitions, {}, { singletonKey: "startup" });

  const stopOutbox = startOutboxLoop(boss);
  logger.info("worker ready");

  const shutdown = async () => {
    stopOutbox();
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.fatal({ err: error }, "worker failed to start");
  process.exit(1);
});
