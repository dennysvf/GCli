import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { detectStoredFileType } from "@/shared/kernel/file-types";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { objectKey } from "@/shared/storage/object-storage";
import { ISSUED_CATEGORY_KEY } from "../domain/categories";
import {
  cleanFileName,
  declaredUploadType,
  isFileSizeAllowed,
  titleFromFileName,
  type DocumentStatus,
} from "../domain/document-file";
import { DocumentsErrors } from "../domain/errors";
import { DOCUMENTS_EVENTS, documentEvent } from "../domain/events";
import { SIGNED_URL_SECONDS, UPLOAD_INTENT_TTL_MS } from "../domain/limits";
import { canStore } from "../domain/quota";
import { ensureDefaultCategories } from "./categories";
import { requirePatientDocuments } from "./policies";
import type { DocumentsDeps } from "./ports";
import { chargeUsage, readUsedBytes, usageOf, type StorageUsage } from "./quota";
import { confirmUploadSchema, uploadIntentSchema } from "./schemas";

// Uploads of patient documents (PRD F08, ADR-031 and ADR-033): the browser sends the file straight
// to the private bucket with a presigned URL, the server confirms the object by its size and its
// real type, and the worker converts HEIC. Documents are never deleted.

const MODULE_DIR = "documents";

export type UploadIntentResult = {
  uploadId: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
  // The document will be clinical; `visibleToUser` says whether this user will see it afterwards.
  clinical: boolean;
  visibleToUser: boolean;
};

// Step 1: authorize and hand out the presigned PUT. Nothing is stored yet, so it is not audited.
export async function createUploadIntent(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<UploadIntentResult>> {
  const parsed = parseInput(uploadIntentSchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, categoryId, fileName, size } = parsed.value;
  const access = await requirePatientDocuments(deps, ctx, patientId, "document:upload");
  if (!access.ok) return access;
  const declared = declaredUploadType(parsed.value.contentType);
  if (!declared || !isFileSizeAllowed(size)) return fail(DocumentsErrors.fileUnsupported(fileName));

  const now = deps.clock();
  const uploadId = newId();
  const key = objectKey(ctx.organizationId, MODULE_DIR, newId());
  const created = await withTransaction(ctx, async (uow) => {
    await ensureDefaultCategories(uow, ctx.organizationId);
    const category = await uow.tx.documentCategory.findFirst({ where: { id: categoryId, active: true } });
    if (!category || category.systemKey === ISSUED_CATEGORY_KEY)
      return fail(DocumentsErrors.categoryInvalid());
    // A soft check: the real one runs under a lock when the upload is confirmed.
    if (!canStore(await readUsedBytes(uow), size)) return fail(DocumentsErrors.quotaExceeded());
    await uow.tx.patientDocumentUpload.create({
      data: {
        id: uploadId,
        organizationId: ctx.organizationId,
        patientId,
        userId: ctx.user.id,
        categoryId,
        title: parsed.value.title ?? titleFromFileName(fileName),
        objectKey: key,
        fileName: cleanFileName(fileName),
        declaredContentType: declared,
        declaredSize: size,
        expiresAt: new Date(now.getTime() + UPLOAD_INTENT_TTL_MS),
      },
    });
    return ok({ clinical: category.isClinical });
  });
  if (!created.ok) return created;
  const header = parsed.value.contentType.toLowerCase();
  const url = await deps.storage.presignUpload(key, header, size);
  return ok({
    uploadId,
    url,
    method: "PUT",
    headers: { "Content-Type": header },
    expiresAt: new Date(now.getTime() + SIGNED_URL_SECONDS * 1000).toISOString(),
    clinical: created.value.clinical,
    visibleToUser: !created.value.clinical || access.value.clinical,
  });
}

export type ConfirmedUpload = {
  documentId: string;
  status: DocumentStatus;
  clinical: boolean;
  visibleToUser: boolean;
  usage: StorageUsage;
};

// Step 2: the object is in the bucket. Check its size and its real type, take the quota under lock
// and create the document. Confirming twice returns the same document.
export async function confirmUpload(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ConfirmedUpload>> {
  const parsed = parseInput(confirmUploadSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();

  const found = await withTransaction(ctx, async (uow) => {
    const intent = await uow.tx.patientDocumentUpload.findFirst({ where: { id: parsed.value.uploadId } });
    return ok(intent && intent.userId === ctx.user.id ? intent : null);
  });
  if (!found.ok) return found;
  const intent = found.value;
  if (!intent) return fail(DocumentsErrors.uploadNotFound());
  const access = await requirePatientDocuments(deps, ctx, intent.patientId, "document:upload");
  if (!access.ok) return access;

  const summaryOf = async (documentId: string): Promise<Result<ConfirmedUpload>> =>
    withTransaction(ctx, async (uow) => {
      const document = await uow.tx.patientDocument.findFirst({ where: { id: documentId } });
      if (!document) return fail(DocumentsErrors.uploadNotFound());
      return ok({
        documentId,
        status: document.status as DocumentStatus,
        clinical: document.isClinical,
        visibleToUser: !document.isClinical || access.value.clinical,
        usage: usageOf(await readUsedBytes(uow)),
      });
    });
  if (intent.documentId) return summaryOf(intent.documentId);
  if (intent.expiresAt.getTime() < now.getTime()) return fail(DocumentsErrors.uploadNotFound());

  const head = await deps.storage.head(intent.objectKey);
  if (!head) return fail(DocumentsErrors.uploadNotFound());
  // What the client declared is never trusted: the size and the first bytes decide (ADR-031).
  const detected = isFileSizeAllowed(head.size)
    ? await detectStoredFileType(deps.storage.reader(intent.objectKey, head.size))
    : null;
  if (!detected) {
    await deps.storage.delete(intent.objectKey);
    return fail(DocumentsErrors.fileUnsupported(intent.fileName));
  }

  const documentId = newId();
  const ready = detected !== "image/heic";
  type Outcome = { existing: true } | { existing: false; clinical: boolean; usage: StorageUsage };
  const result = await withTransaction<Outcome>(ctx, async (uow) => {
    // Claims the intent: a concurrent confirmation of the same upload waits here and then finds it taken.
    const claimed = await uow.tx.patientDocumentUpload.updateMany({
      where: { id: intent.id, documentId: null },
      data: { documentId },
    });
    if (claimed.count === 0) return ok({ existing: true });
    const category = await uow.tx.documentCategory.findFirst({ where: { id: intent.categoryId } });
    if (!category) return fail(DocumentsErrors.categoryInvalid());
    const charged = await chargeUsage(deps, ctx, uow, ctx.organizationId, head.size, { enforce: true });
    if (!charged.ok) return charged;
    await uow.tx.patientDocument.create({
      data: {
        id: documentId,
        organizationId: ctx.organizationId,
        patientId: intent.patientId,
        kind: "UPLOADED",
        categoryId: intent.categoryId,
        title: intent.title,
        isClinical: category.isClinical,
        status: ready ? "READY" : "PROCESSING",
        fileName: intent.fileName,
        sourceContentType: detected,
        sourceObjectKey: intent.objectKey,
        // A converted HEIC is served from a new object; everything else is served as it is.
        objectKey: ready ? intent.objectKey : null,
        contentType: ready ? detected : null,
        sizeBytes: head.size,
        storedBytes: head.size,
        authorUserId: ctx.user.id,
      },
    });
    if (!ready) {
      await uow.outbox.add("documents.file-process", { documentId, organizationId: ctx.organizationId });
    }
    await uow.audit.record({
      action: "CREATE",
      entityType: "patient_document",
      entityId: documentId,
      summary: "Documento do paciente enviado",
      metadata: { contentType: detected, size: head.size, clinical: category.isClinical },
    });
    await uow.publish(
      documentEvent(
        DOCUMENTS_EVENTS.added,
        {
          documentId,
          patientId: intent.patientId,
          kind: "UPLOADED",
          clinical: category.isClinical,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok({
      existing: false,
      clinical: category.isClinical,
      usage: usageOf(charged.value.after),
    });
  });

  if (!result.ok) {
    // A file the quota refused is referenced by nothing: it can go.
    if (result.error.code === "DOCUMENT_QUOTA_EXCEEDED") await deps.storage.delete(intent.objectKey);
    return result;
  }
  if (result.value.existing) {
    const current = await withTransaction(ctx, async (uow) => {
      const taken = await uow.tx.patientDocumentUpload.findFirst({ where: { id: intent.id } });
      return ok(taken?.documentId ?? null);
    });
    return current.ok && current.value ? summaryOf(current.value) : fail(DocumentsErrors.uploadNotFound());
  }
  return ok({
    documentId,
    status: ready ? "READY" : "PROCESSING",
    clinical: result.value.clinical,
    visibleToUser: !result.value.clinical || access.value.clinical,
    usage: result.value.usage,
  });
}
