import { privacy } from "@/modules/privacy";
import { db } from "@/shared/db/client";
import type { EmailJobData } from "@/shared/jobs/queues";
import { logger } from "@/shared/logging/logger";

// F14 jobs (architecture 5.5). The handlers are thin: the rules live in the privacy use cases.

export type PrivacyJob = Pick<EmailJobData, "payload">;

// Builds one LGPD export. The use case never throws, so the queue never retries it (spec D14).
export async function buildExportJob(job: PrivacyJob): Promise<void> {
  const organizationId = String(job.payload.organizationId ?? "");
  const exportId = String(job.payload.exportId ?? "");
  if (!organizationId || !exportId) return;
  const outcome = await privacy.buildExport({ organizationId, exportId });
  // Ids only: no personal data in logs.
  logger.info(
    { exportId, status: outcome.status, errorCode: outcome.errorCode },
    "LGPD export build finished",
  );
}

// Deletes the file of an export expired by an anonymization.
export async function deleteExportFileJob(job: PrivacyJob): Promise<void> {
  const key = String(job.payload.objectKey ?? "");
  if (key) await privacy.deleteExportFile({ objectKey: key });
}

// PRD F14: export files are deleted 7 days after they are ready.
export async function cleanupExpiredExportsJob(now = new Date()): Promise<number> {
  const organizations = await db().organization.findMany({ select: { id: true } });
  let expired = 0;
  for (const organization of organizations) {
    expired += (await privacy.cleanupExpiredExports({ organizationId: organization.id, now })).expired;
  }
  return expired;
}
