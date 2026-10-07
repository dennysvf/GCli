import type { SystemContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { ok, type Result } from "@/shared/kernel/result";
import { objectKey } from "@/shared/storage/object-storage";
import type { DocumentsDeps } from "./ports";
import { chargeUsage } from "./quota";

// Work done by the worker (architecture 5.5): the handlers are thin, the rules live here.

const MODULE_DIR = "documents";

function systemContext(organizationId: string): SystemContext {
  return { kind: "system", requestId: newId(), organizationId, ipAddress: null, userAgent: null };
}

// Converts a HEIC upload to JPG (architecture 5.5). Idempotent: a document that is no longer
// PROCESSING is left alone, so a retried job never converts twice. The bytes of the converted file
// are counted in the quota but never blocked (spec F08).
export async function processDocumentFile(
  deps: DocumentsDeps,
  input: { organizationId: string; documentId: string },
): Promise<Result<{ processed: boolean }>> {
  const ctx = systemContext(input.organizationId);
  const current = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.patientDocument.findFirst({ where: { id: input.documentId } })),
  );
  if (!current.ok) return current;
  const document = current.value;
  if (!document || document.status !== "PROCESSING") return ok({ processed: false });

  const source = await deps.storage.get(document.sourceObjectKey);
  if (!source) throw new Error("document source object is missing");
  const jpeg = await deps.images.heicToJpeg(source);
  const servedKey = objectKey(input.organizationId, MODULE_DIR, newId());
  await deps.storage.put(servedKey, jpeg, "image/jpeg");

  const result = await withTransaction(ctx, async (uow) => {
    const updated = await uow.tx.patientDocument.updateMany({
      where: { id: document.id, status: "PROCESSING" },
      data: {
        objectKey: servedKey,
        contentType: "image/jpeg",
        storedBytes: document.sizeBytes + jpeg.length,
        status: "READY",
      },
    });
    if (updated.count === 0) return ok({ processed: false });
    await chargeUsage(deps, ctx, uow, input.organizationId, jpeg.length, { enforce: false });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "patient_document",
      entityId: document.id,
      summary: "Documento do paciente processado",
      metadata: { status: "READY" },
    });
    return ok({ processed: true });
  });
  // Another run won the race: the object this one made is referenced by nothing.
  if (result.ok && !result.value.processed) await deps.storage.delete(servedKey);
  return result;
}

// After the last retry the document is marked FAILED; the original stays downloadable.
export async function markDocumentFileFailed(
  deps: DocumentsDeps,
  input: { organizationId: string; documentId: string },
): Promise<Result<void>> {
  void deps;
  const ctx = systemContext(input.organizationId);
  return withTransaction(ctx, async (uow) => {
    const updated = await uow.tx.patientDocument.updateMany({
      where: { id: input.documentId, status: "PROCESSING" },
      data: { status: "FAILED" },
    });
    if (updated.count > 0) {
      await uow.audit.record({
        action: "UPDATE",
        entityType: "patient_document",
        entityId: input.documentId,
        summary: "Processamento do documento do paciente falhou",
        metadata: { status: "FAILED" },
      });
    }
    return ok(undefined);
  });
}
