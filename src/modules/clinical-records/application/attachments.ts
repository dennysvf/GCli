import type { RequestContext, SystemContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { objectKey } from "@/shared/storage/object-storage";
import {
  canAddAttachment,
  canMarkInError,
  checkAttachmentSize,
  cleanFileName,
  declaredAttachmentType,
  detectAttachmentType,
  type AttachmentStatus,
  type AttachmentType,
} from "../domain/attachment";
import { ClinicalErrors } from "../domain/errors";
import { clinicalEvent, CLINICAL_RECORDS_EVENTS } from "../domain/events";
import { SIGNED_URL_SECONDS, UPLOAD_INTENT_TTL_MS } from "../domain/limits";
import { loadAccessibleNote } from "./access";
import { requireWriter } from "./policies";
import type { Actor, ClinicalRecordsDeps } from "./ports";
import {
  attachmentIdSchema,
  attachmentVariantSchema,
  confirmAttachmentSchema,
  uploadIntentSchema,
} from "./schemas";

// Clinical attachments (PRD F07 Capabilities, ADR-031): the browser uploads straight to the private
// bucket with a presigned URL, the server confirms the object by its size and first bytes, and the
// worker converts HEIC and makes thumbnails. Files are never deleted; a mistake is only marked.

const MODULE_DIR = "clinical-records";

function actorOf(ctx: RequestContext): Actor {
  return { userId: ctx.user.id, organizationId: ctx.organizationId };
}

export type UploadIntentResult = {
  uploadId: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

// Step 1 of an upload: authorize and hand out the presigned PUT. Nothing clinical is stored yet,
// so the intent is not audited.
export async function createUploadIntent(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<UploadIntentResult>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(uploadIntentSchema, input);
  if (!parsed.ok) return parsed;
  const declared = declaredAttachmentType(parsed.value.contentType);
  if (!declared) return fail(ClinicalErrors.attachmentUnsupported());
  const size = checkAttachmentSize(parsed.value.size);
  if (!size.ok) return size;

  const now = deps.clock();
  const uploadId = newId();
  const key = objectKey(ctx.organizationId, MODULE_DIR, newId());
  const declaredHeader = parsed.value.contentType.toLowerCase();
  const created = await withTransaction(ctx, async (uow) => {
    const note = await deps.notes.findById(uow, parsed.value.noteId);
    if (!note) return fail(ClinicalErrors.noteNotFound());
    if (!note.isAuthor(ctx.user.id)) return fail(ClinicalErrors.notAuthor());
    const allowed = canAddAttachment({
      editable: note.isEditable(now),
      activeCount: await deps.attachments.countActive(uow, note.snapshot.id),
    });
    if (!allowed.ok) return allowed;
    await deps.attachments.createIntent(
      uow,
      {
        id: uploadId,
        noteId: note.snapshot.id,
        userId: ctx.user.id,
        objectKey: key,
        fileName: cleanFileName(parsed.value.fileName),
        declaredContentType: declared,
        declaredSize: parsed.value.size,
        expiresAt: new Date(now.getTime() + UPLOAD_INTENT_TTL_MS),
      },
      actorOf(ctx),
    );
    return ok(undefined);
  });
  if (!created.ok) return created;
  const url = await deps.storage.presignUpload(key, declaredHeader, parsed.value.size);
  return ok({
    uploadId,
    url,
    method: "PUT",
    headers: { "Content-Type": declaredHeader },
    expiresAt: new Date(now.getTime() + SIGNED_URL_SECONDS * 1000).toISOString(),
  });
}

export type AttachmentSummary = {
  attachmentId: string;
  status: AttachmentStatus;
  fileName: string;
  contentType: AttachmentType;
  size: number;
};

// Step 2: the object is in the bucket. Check its size and its real type before creating the record.
export async function confirmAttachment(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<AttachmentSummary>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(confirmAttachmentSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();

  const found = await withTransaction(ctx, async (uow) => {
    const intent = await deps.attachments.findIntent(uow, parsed.value.uploadId);
    if (!intent || intent.userId !== ctx.user.id) return fail(ClinicalErrors.uploadNotFound());
    const existing = intent.attachmentId ? await deps.attachments.find(uow, intent.attachmentId) : null;
    return ok({ intent, existing });
  });
  if (!found.ok) return found;
  const { intent, existing } = found.value;
  // Confirming twice returns the same attachment.
  if (existing) {
    return ok({
      attachmentId: existing.id,
      status: existing.status,
      fileName: existing.fileName,
      contentType: existing.sourceContentType,
      size: existing.sizeBytes,
    });
  }
  if (intent.expiresAt.getTime() < now.getTime()) return fail(ClinicalErrors.uploadNotFound());

  const head = await deps.storage.head(intent.objectKey);
  if (!head) return fail(ClinicalErrors.uploadNotFound());
  const sizeOk = checkAttachmentSize(head.size);
  const bytes = sizeOk.ok ? await deps.storage.firstBytes(intent.objectKey, 16) : null;
  const detected = bytes ? detectAttachmentType(bytes) : null;
  if (!sizeOk.ok || !detected) {
    await deps.storage.delete(intent.objectKey);
    return fail(ClinicalErrors.attachmentUnsupported());
  }

  const attachmentId = newId();
  const result = await withTransaction(ctx, async (uow) => {
    // The note row is locked so two confirmations cannot both pass the limit.
    await deps.notes.lock(uow, intent.noteId, ctx.organizationId);
    const note = await deps.notes.findById(uow, intent.noteId);
    if (!note) return fail(ClinicalErrors.noteNotFound());
    if (!note.isAuthor(ctx.user.id)) return fail(ClinicalErrors.notAuthor());
    const allowed = canAddAttachment({
      editable: note.isEditable(now),
      activeCount: await deps.attachments.countActive(uow, note.snapshot.id),
    });
    if (!allowed.ok) return allowed;
    // A PDF is served as it is; images wait for the worker (HEIC conversion and thumbnail).
    const ready = detected === "application/pdf";
    await deps.attachments.insert(
      uow,
      {
        id: attachmentId,
        noteId: note.snapshot.id,
        uploadedById: ctx.user.id,
        fileName: intent.fileName,
        sourceContentType: detected,
        sourceObjectKey: intent.objectKey,
        objectKey: ready ? intent.objectKey : null,
        contentType: ready ? detected : null,
        thumbnailKey: null,
        sizeBytes: head.size,
        status: ready ? "READY" : "PROCESSING",
        markedInErrorAt: null,
      },
      actorOf(ctx),
    );
    await deps.attachments.consumeIntent(uow, intent.id, attachmentId, now);
    if (!ready) {
      await uow.outbox.add("clinical.attachment-process", {
        attachmentId,
        organizationId: ctx.organizationId,
      });
    }
    await uow.audit.record({
      action: "CREATE",
      entityType: "clinical_attachment",
      entityId: attachmentId,
      summary: "Anexo clínico adicionado",
      metadata: { noteId: note.snapshot.id, contentType: detected, size: head.size },
    });
    await uow.publish(
      clinicalEvent(
        CLINICAL_RECORDS_EVENTS.attachmentAdded,
        {
          noteId: note.snapshot.id,
          patientId: note.snapshot.patientId,
          appointmentId: note.snapshot.appointmentId,
          professionalId: note.snapshot.professionalId,
          actorUserId: ctx.user.id,
          attachmentId,
        },
        now,
      ),
    );
    return ok({
      attachmentId,
      status: (ready ? "READY" : "PROCESSING") as AttachmentStatus,
      fileName: intent.fileName,
      contentType: detected,
      size: head.size,
    });
  });
  if (
    !result.ok &&
    (result.error.code === "CLINICAL_ATTACHMENT_LIMIT" || result.error.code === "CLINICAL_ATTACHMENTS_CLOSED")
  ) {
    // The file was refused, and nothing references the object: it can go.
    await deps.storage.delete(intent.objectKey);
  }
  return result;
}

// "Anexado por engano": hides the attachment from the default view but keeps it in the record.
export async function markAttachmentInError(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ markedInErrorAt: string }>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(attachmentIdSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    const attachment = await deps.attachments.find(uow, parsed.value.attachmentId);
    if (!attachment) return fail(ClinicalErrors.attachmentNotFound());
    const allowed = canMarkInError({
      actorUserId: ctx.user.id,
      uploadedById: attachment.uploadedById,
      uploadedAt: attachment.createdAt,
      alreadyMarked: attachment.markedInErrorAt !== null,
      now,
    });
    if (!allowed.ok) return allowed;
    if (attachment.markedInErrorAt) return ok({ markedInErrorAt: attachment.markedInErrorAt.toISOString() });
    const note = await deps.notes.findById(uow, attachment.noteId);
    if (!note) return fail(ClinicalErrors.noteNotFound());
    await deps.attachments.update(uow, attachment.id, {
      markedInErrorAt: now,
      markedInErrorById: ctx.user.id,
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "clinical_attachment",
      entityId: attachment.id,
      summary: "Anexo clínico marcado como enviado por engano",
      metadata: { noteId: attachment.noteId },
    });
    await uow.publish(
      clinicalEvent(
        CLINICAL_RECORDS_EVENTS.attachmentMarkedInError,
        {
          noteId: note.snapshot.id,
          patientId: note.snapshot.patientId,
          appointmentId: note.snapshot.appointmentId,
          professionalId: note.snapshot.professionalId,
          actorUserId: ctx.user.id,
          attachmentId: attachment.id,
        },
        now,
      ),
    );
    return ok({ markedInErrorAt: now.toISOString() });
  });
}

// A 5-minute URL for one attachment (PRD F07, ADR-009), issued only after authorization, and every
// opening is audited as a clinical read.
export async function openAttachment(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ url: string; expiresInSeconds: number }>> {
  const parsed = parseInput(attachmentIdSchema, input);
  if (!parsed.ok) return parsed;
  const variant = attachmentVariantSchema.safeParse((input as { variant?: unknown }).variant ?? "converted");
  const found = await withTransaction(ctx, async (uow) => {
    const attachment = await deps.attachments.find(uow, parsed.value.attachmentId);
    return ok(attachment);
  });
  if (!found.ok) return found;
  if (!found.value) return fail(ClinicalErrors.attachmentNotFound());
  const attachment = found.value;
  const loaded = await loadAccessibleNote(deps, ctx, attachment.noteId);
  if (!loaded.ok) return loaded;
  const wantsOriginal = variant.success && variant.data === "original";
  const key = wantsOriginal
    ? attachment.sourceObjectKey
    : (attachment.objectKey ?? attachment.sourceObjectKey);
  const url = await deps.storage.presignDownload(key, { contentDisposition: "inline" });
  await withTransaction(ctx, async (uow) => {
    await uow.audit.record({
      action: "READ_SENSITIVE",
      entityType: "clinical_attachment",
      entityId: attachment.id,
      summary: "Anexo clínico aberto",
      metadata: { variant: wantsOriginal ? "original" : "converted", noteId: attachment.noteId },
    });
    return ok(undefined);
  });
  return ok({ url, expiresInSeconds: SIGNED_URL_SECONDS });
}

// --- Worker ------------------------------------------------------------------------------------

function systemContext(organizationId: string): SystemContext {
  return { kind: "system", requestId: newId(), organizationId, ipAddress: null, userAgent: null };
}

// Converts a HEIC upload to JPG and makes the thumbnail (architecture 5.5). Idempotent: anything
// that is no longer PROCESSING is left alone, so a retried job never duplicates work.
export async function processAttachment(
  deps: ClinicalRecordsDeps,
  input: { organizationId: string; attachmentId: string },
): Promise<Result<{ processed: boolean }>> {
  const ctx = systemContext(input.organizationId);
  const current = await withTransaction(ctx, async (uow) =>
    ok(await deps.attachments.find(uow, input.attachmentId)),
  );
  if (!current.ok) return current;
  const attachment = current.value;
  if (!attachment || attachment.status !== "PROCESSING") return ok({ processed: false });

  const source = await deps.storage.get(attachment.sourceObjectKey);
  if (!source) throw new Error("attachment source object is missing");
  let servedKey = attachment.sourceObjectKey;
  let servedType: string = attachment.sourceContentType;
  let servedBytes = source;
  if (attachment.sourceContentType === "image/heic") {
    servedBytes = await deps.images.heicToJpeg(source);
    servedKey = objectKey(input.organizationId, MODULE_DIR, newId());
    servedType = "image/jpeg";
    await deps.storage.put(servedKey, servedBytes, servedType);
  }
  const thumbnail = await deps.images.thumbnail(servedBytes);
  const thumbnailKey = `${servedKey}-thumb.jpg`;
  await deps.storage.put(thumbnailKey, thumbnail, "image/jpeg");

  return withTransaction(ctx, async (uow) => {
    await deps.attachments.update(uow, attachment.id, {
      objectKey: servedKey,
      contentType: servedType,
      thumbnailKey,
      status: "READY",
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "clinical_attachment",
      entityId: attachment.id,
      summary: "Anexo clínico processado",
      metadata: { status: "READY" },
    });
    return ok({ processed: true });
  });
}

// After the last retry the attachment is marked FAILED; the original stays downloadable.
export async function markAttachmentFailed(
  deps: ClinicalRecordsDeps,
  input: { organizationId: string; attachmentId: string },
): Promise<Result<void>> {
  const ctx = systemContext(input.organizationId);
  return withTransaction(ctx, async (uow) => {
    const attachment = await deps.attachments.find(uow, input.attachmentId);
    if (!attachment || attachment.status !== "PROCESSING") return ok(undefined);
    await deps.attachments.update(uow, attachment.id, { status: "FAILED" });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "clinical_attachment",
      entityId: attachment.id,
      summary: "Processamento do anexo clínico falhou",
      metadata: { status: "FAILED" },
    });
    return ok(undefined);
  });
}
