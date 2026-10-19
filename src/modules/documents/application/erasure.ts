import { authorize } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import { ok, type Result } from "@/shared/kernel/result";
import type { DocumentsDeps } from "./ports";
import { lockOrganizationDocuments } from "./quota";

// PRD F14 anonymization of documents, called by the privacy module inside its own transaction
// (ADR-040). The PRD "deletes" the non-clinical uploads; documents are never hard-deleted (PRD F08,
// migration 0010), so each row is kept marked erased, its title and file name are replaced, and only
// its stored files are deleted, after commit, through the outbox. Clinical and generated documents
// are kept. The quota counter gives the space back.

export const ERASED_TITLE = "—";
export const ERASED_FILE_NAME = "erased";
// Stored as the archive reason of an erased document; screens show the erased state instead.
export const ERASED_ARCHIVE_REASON = "LGPD_ANONYMIZATION";

export async function eraseNonClinicalUploadsIn(
  deps: DocumentsDeps,
  ctx: RequestContext,
  uow: UnitOfWork,
  patientId: string,
): Promise<Result<{ erased: number }>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const rows = await uow.tx.patientDocument.findMany({
    where: { patientId, kind: "UPLOADED", isClinical: false, erasedAt: null },
    select: {
      id: true,
      title: true,
      sourceObjectKey: true,
      objectKey: true,
      storedBytes: true,
      archivedAt: true,
      archivedById: true,
      archiveReason: true,
    },
  });
  if (rows.length === 0) return ok({ erased: 0 });
  const now = deps.clock();
  await lockOrganizationDocuments(uow, ctx.organizationId);
  let freed = 0;
  for (const row of rows) {
    await uow.tx.patientDocument.update({
      where: { id: row.id },
      data: {
        title: ERASED_TITLE,
        fileName: ERASED_FILE_NAME,
        erasedAt: now,
        erasedById: ctx.user.id,
        archivedAt: row.archivedAt ?? now,
        archivedById: row.archivedById ?? ctx.user.id,
        archiveReason: row.archiveReason ?? ERASED_ARCHIVE_REASON,
        version: { increment: 1 },
      },
    });
    freed += row.storedBytes;
    await uow.audit.record({
      action: "UPDATE",
      entityType: "patient_document",
      entityId: row.id,
      summary: "Documento do paciente apagado na anonimização",
      // A title can name a person or an exam: only its length is recorded.
      changes: diffChanges(
        { title: row.title, erased: false },
        { title: ERASED_TITLE, erased: true },
        { sensitive: ["title"] },
      ),
      metadata: { patientId },
    });
    const keys = [...new Set([row.sourceObjectKey, row.objectKey].filter((key): key is string => !!key))];
    await uow.outbox.add("documents.file-erase", {
      organizationId: ctx.organizationId,
      documentId: row.id,
      keys,
    });
  }
  await uow.tx.$executeRaw`
    UPDATE document_storage_usage
    SET used_bytes = GREATEST(0, used_bytes - ${freed}::bigint), updated_at = now()
    WHERE organization_id = ${ctx.organizationId}::uuid`;
  return ok({ erased: rows.length });
}

// The worker side: deletes the stored files of an erased document. Idempotent.
export async function eraseDocumentFile(deps: DocumentsDeps, input: { keys: string[] }): Promise<void> {
  for (const key of input.keys) await deps.storage.delete(key);
}
