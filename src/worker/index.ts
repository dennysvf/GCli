import * as Sentry from "@sentry/node";
import { PgBoss } from "pg-boss";
import { registerModules } from "@/composition";
import { ensureAuditPartitions } from "@/modules/audit";
import { getEnv } from "@/shared/config/env";
import { createSmtpEmailSender } from "@/shared/email/email-sender";
import { QUEUES, type EmailJobData } from "@/shared/jobs/queues";
import { logger } from "@/shared/logging/logger";
import { sentryOptions } from "@/shared/observability/sentry";
import { cleanupIdentityData } from "./jobs/identity-cleanup";
import {
  autoFinalizeExpiredDrafts,
  cleanupClinicalUploads,
  processClinicalAttachment,
} from "./jobs/clinical-records";
import { cleanupDocumentUploads, processDocumentFileJob } from "./jobs/documents";
import { cleanupPatientUploads } from "./jobs/patients-cleanup";
import { sendOutboxEmail } from "./jobs/email-send";
import { startOutboxLoop } from "./outbox-dispatcher";

// Worker process (architecture section 2): outbox delivery, email sending, and maintenance crons.
async function main() {
  const env = getEnv();
  registerModules();
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
  await boss.work(QUEUES.patientsCleanup, async () => {
    const removed = await cleanupPatientUploads();
    if (removed) logger.info({ removed }, "unused consent uploads removed");
  });

  // F07: HEIC conversion and thumbnails, auto-finalization of expired drafts, unused upload intents.
  await boss.work<EmailJobData>(QUEUES.clinicalAttachmentProcess, async (jobs) => {
    for (const job of jobs)
      await processClinicalAttachment({ payload: job.data.payload, retryCount: job.retryCount });
  });
  await boss.work(QUEUES.clinicalNotesAutoFinalize, async () => {
    const changed = await autoFinalizeExpiredDrafts();
    if (changed) logger.info({ changed }, "clinical notes locked and finalized");
  });
  await boss.work(QUEUES.clinicalUploadsCleanup, async () => {
    const removed = await cleanupClinicalUploads();
    if (removed) logger.info({ removed }, "unused clinical upload intents removed");
  });

  // F08: HEIC conversion of documents and unused upload intents.
  await boss.work<EmailJobData>(QUEUES.documentsFileProcess, async (jobs) => {
    for (const job of jobs)
      await processDocumentFileJob({ payload: job.data.payload, retryCount: job.retryCount });
  });
  await boss.work(QUEUES.documentsUploadsCleanup, async () => {
    const removed = await cleanupDocumentUploads();
    if (removed) logger.info({ removed }, "unused document upload intents removed");
  });

  // Monthly on day 1 at 03:00, and daily at 03:30 (server time).
  await boss.schedule(QUEUES.auditEnsurePartitions, "0 3 1 * *");
  await boss.schedule(QUEUES.identityCleanup, "30 3 * * *");
  await boss.schedule(QUEUES.patientsCleanup, "45 3 * * *");
  // F07: every 5 minutes, and daily at 04:00.
  await boss.schedule(QUEUES.clinicalNotesAutoFinalize, "*/5 * * * *");
  await boss.schedule(QUEUES.clinicalUploadsCleanup, "0 4 * * *");
  // F08: daily at 04:15.
  await boss.schedule(QUEUES.documentsUploadsCleanup, "15 4 * * *");
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
