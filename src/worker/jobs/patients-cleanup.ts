import { db } from "@/shared/db/client";
import { objectStorage } from "@/shared/storage/object-storage";

// ADR-023: consent files uploaded but never attached to a consent are deleted after 24 hours.
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export async function cleanupPatientUploads(now = new Date()): Promise<number> {
  const stale = await db().consentUpload.findMany({
    where: { consumedAt: null, createdAt: { lt: new Date(now.getTime() - UPLOAD_TTL_MS) } },
    select: { id: true, objectKey: true },
    take: 500,
  });
  for (const upload of stale) {
    await objectStorage().delete(upload.objectKey);
    await db().consentUpload.delete({ where: { id: upload.id } });
  }
  return stale.length;
}
