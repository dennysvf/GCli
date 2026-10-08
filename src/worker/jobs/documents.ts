import { documents } from "@/modules/documents";
import { db } from "@/shared/db/client";
import type { EmailJobData } from "@/shared/jobs/queues";
import { logger } from "@/shared/logging/logger";
import { objectStorage } from "@/shared/storage/object-storage";

// Maintenance of the patient documents (spec F08, architecture 5.5). The handlers are thin: the
// rules live in the documents use cases.

// pg-boss retries the conversion; after the last attempt the document is marked FAILED and its
// original stays downloadable.
const PROCESS_ATTEMPTS = 3;

export type DocumentFileJob = Pick<EmailJobData, "payload"> & { retryCount?: number };

export async function processDocumentFileJob(job: DocumentFileJob): Promise<void> {
  const organizationId = String(job.payload.organizationId ?? "");
  const documentId = String(job.payload.documentId ?? "");
  if (!organizationId || !documentId) return;
  try {
    await documents.processDocumentFile({ organizationId, documentId });
  } catch (error) {
    if ((job.retryCount ?? 0) + 1 >= PROCESS_ATTEMPTS) {
      logger.error({ documentId, err: error }, "document file processing failed for good");
      await documents.markDocumentFileFailed({ organizationId, documentId });
      return;
    }
    throw error;
  }
}

// Upload intents that were never confirmed (the browser closed, the file was refused) are removed
// after their 24 hours, with their objects. Confirmed intents stay.
export async function cleanupDocumentUploads(now = new Date()): Promise<number> {
  const stale = await db().patientDocumentUpload.findMany({
    where: { documentId: null, expiresAt: { lt: now } },
    select: { id: true, objectKey: true },
    take: 500,
  });
  for (const upload of stale) {
    await objectStorage().delete(upload.objectKey);
    await db().patientDocumentUpload.delete({ where: { id: upload.id } });
  }
  return stale.length;
}
