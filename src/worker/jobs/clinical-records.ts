import { clinicalRecords } from "@/modules/clinical-records";
import { db } from "@/shared/db/client";
import type { EmailJobData } from "@/shared/jobs/queues";
import { logger } from "@/shared/logging/logger";
import { objectStorage } from "@/shared/storage/object-storage";

// Maintenance of the clinical records (spec F07 section 3, architecture 5.5). The handlers are thin:
// the rules live in the clinical-records use cases.

// Spec F07: pg-boss retries processing; after the last attempt the attachment is marked FAILED and
// its original stays downloadable.
const PROCESS_ATTEMPTS = 3;

export type AttachmentJob = Pick<EmailJobData, "payload"> & { retryCount?: number };

export async function processClinicalAttachment(job: AttachmentJob): Promise<void> {
  const organizationId = String(job.payload.organizationId ?? "");
  const attachmentId = String(job.payload.attachmentId ?? "");
  if (!organizationId || !attachmentId) return;
  try {
    await clinicalRecords.processAttachment({ organizationId, attachmentId });
  } catch (error) {
    if ((job.retryCount ?? 0) + 1 >= PROCESS_ATTEMPTS) {
      logger.error({ attachmentId, err: error }, "clinical attachment processing failed for good");
      await clinicalRecords.markAttachmentFailed({ organizationId, attachmentId });
      return;
    }
    throw error;
  }
}

// Finalizes drafts whose 24 hours ended, and discards the edits still pending at the lock. The
// candidates are found across organizations; each note is handled in its own organization.
const AUTO_FINALIZE_BATCH = 200;

export async function autoFinalizeExpiredDrafts(now = new Date()): Promise<number> {
  const expired = await db().clinicalNote.findMany({
    where: { locksAt: { lte: now }, OR: [{ status: "DRAFT" }, { editDraftHtml: { not: null } }] },
    select: { id: true, organizationId: true },
    take: AUTO_FINALIZE_BATCH,
  });
  let changed = 0;
  for (const note of expired) {
    const result = await clinicalRecords.autoFinalizeNote({
      organizationId: note.organizationId,
      noteId: note.id,
    });
    if (result.ok && (result.value.finalized || result.value.discardedEdit)) changed += 1;
  }
  return changed;
}

// Upload intents that were never confirmed (the browser closed, the file was refused) are removed
// after their 24 hours, with their objects. Consumed intents stay.
export async function cleanupClinicalUploads(now = new Date()): Promise<number> {
  const stale = await db().clinicalAttachmentUpload.findMany({
    where: { consumedAt: null, expiresAt: { lt: now } },
    select: { id: true, objectKey: true },
    take: 500,
  });
  for (const upload of stale) {
    await objectStorage().delete(upload.objectKey);
    await db().clinicalAttachmentUpload.delete({ where: { id: upload.id } });
  }
  return stale.length;
}
