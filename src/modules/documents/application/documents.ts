import { recordDenial } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { ISSUED_CATEGORY_KEY } from "../domain/categories";
import { nextClinicalFlag } from "../domain/clinical-flag";
import { isPreviewable, servedFileName, type DocumentStatus } from "../domain/document-file";
import { DocumentsErrors } from "../domain/errors";
import { DOCUMENTS_EVENTS, documentEvent } from "../domain/events";
import { PAGE_SIZE, SIGNED_URL_SECONDS } from "../domain/limits";
import { canManageDocuments, requireDocumentAccess, requirePatientDocuments } from "./policies";
import type { DocumentsDeps } from "./ports";
import {
  archiveDocumentSchema,
  dispositionSchema,
  documentIdSchema,
  downloadVariantSchema,
  listDocumentsSchema,
  restoreDocumentSchema,
  updateDocumentSchema,
} from "./schemas";
import { contentDisposition, isClinicalFlagViolation } from "./support";

// Patient documents: the list, opening a file, and the corrections (PRD F08 Capabilities and
// Experience). Documents are never deleted: archiving hides them and can be undone.

export type DocumentItem = {
  id: string;
  kind: "UPLOADED" | "GENERATED";
  title: string;
  categoryId: string;
  categoryName: string;
  clinical: boolean;
  status: DocumentStatus;
  contentType: string | null;
  sizeBytes: number;
  createdAt: string;
  authorName: string;
  archived: { at: string; reason: string; byName: string } | null;
  version: number;
  previewable: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canRestore: boolean;
};

export type DocumentPage = {
  items: DocumentItem[];
  nextCursor: string | null;
  // Whether this user may read the clinical documents of the patient (the F07 records policy).
  canReadClinical: boolean;
};

const SEPARATOR = "|";

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}${SEPARATOR}${row.id}`;
}

function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split(SEPARATOR);
  const createdAt = new Date(iso ?? "");
  return id && !Number.isNaN(createdAt.getTime()) ? { createdAt, id } : null;
}

// The newest documents first. Clinical documents are listed only to those who pass the F07 records
// policy, and a page that includes clinical documents is an audited read of them.
export async function listPatientDocuments(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<DocumentPage>> {
  const parsed = parseInput(listDocumentsSchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, categoryId, kind, includeArchived, cursor } = parsed.value;
  const access = await requirePatientDocuments(deps, ctx, patientId, "document:read");
  if (!access.ok) return access;
  const after = decodeCursor(cursor);
  const manages = canManageDocuments(ctx);

  const page = await withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.patientDocument.findMany({
      where: {
        patientId,
        ...(categoryId ? { categoryId } : {}),
        ...(kind ? { kind } : {}),
        ...(includeArchived ? {} : { archivedAt: null }),
        ...(access.value.clinical ? {} : { isClinical: false }),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      include: { category: { select: { name: true } } },
    });
    const clinicalIds = rows.filter((row) => row.isClinical).map((row) => row.id);
    if (clinicalIds.length > 0) {
      await uow.audit.record({
        action: "READ_SENSITIVE",
        entityType: "patient",
        entityId: patientId,
        summary: "Lista de documentos com itens clínicos consultada",
        metadata: { documentIds: clinicalIds },
      });
    }
    return ok(rows);
  });
  if (!page.ok) return page;
  const hasMore = page.value.length > PAGE_SIZE;
  const rows = page.value.slice(0, PAGE_SIZE);
  const userIds = rows.flatMap((row) => [row.authorUserId, ...(row.archivedById ? [row.archivedById] : [])]);
  const names = await deps.directory.userNames(ctx, userIds);
  const items = rows.map((row): DocumentItem => {
    const own = row.authorUserId === ctx.user.id;
    return {
      id: row.id,
      kind: row.kind as DocumentItem["kind"],
      title: row.title,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      clinical: row.isClinical,
      status: row.status as DocumentStatus,
      contentType: row.contentType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt.toISOString(),
      authorName: names.get(row.authorUserId) ?? "",
      archived: row.archivedAt
        ? {
            at: row.archivedAt.toISOString(),
            reason: row.archiveReason ?? "",
            byName: row.archivedById ? (names.get(row.archivedById) ?? "") : "",
          }
        : null,
      version: row.version,
      previewable: row.status === "READY" && isPreviewable(row.contentType),
      canEdit: row.kind === "UPLOADED" && (own || manages),
      canArchive: manages && !row.archivedAt,
      canRestore: manages && !!row.archivedAt,
    };
  });
  const last = rows[rows.length - 1];
  return ok({
    items,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    canReadClinical: access.value.clinical,
  });
}

// A 5-minute URL for one document (PRD F08, ADR-009), issued only after authorization; every
// opening is an audited read, because documents hold personal data (ID copies, exams).
export async function openDocument(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ url: string; expiresInSeconds: number }>> {
  const parsed = parseInput(documentIdSchema, input);
  if (!parsed.ok) return parsed;
  const variant = downloadVariantSchema.safeParse((input as { variant?: unknown }).variant);
  const disposition = dispositionSchema.safeParse((input as { disposition?: unknown }).disposition);
  const wantsOriginal = variant.success && variant.data === "original";
  const attachment = disposition.success && disposition.data === "attachment";

  const found = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.patientDocument.findFirst({ where: { id: parsed.value.documentId } })),
  );
  if (!found.ok) return found;
  const document = found.value;
  if (!document) return fail(DocumentsErrors.notFound());
  const access = await requireDocumentAccess(deps, ctx, document, "document:read");
  if (!access.ok) return access;

  // A HEIC that is still being converted is served as the original.
  const key = wantsOriginal ? document.sourceObjectKey : (document.objectKey ?? document.sourceObjectKey);
  const servedType = wantsOriginal
    ? document.sourceContentType
    : (document.contentType ?? document.sourceContentType);
  const fileName = wantsOriginal
    ? document.fileName
    : servedFileName(document.fileName, servedType, document.sourceContentType);
  const url = await deps.storage.presignDownload(key, {
    contentDisposition: contentDisposition(attachment ? "attachment" : "inline", fileName),
  });
  await withTransaction(ctx, async (uow) => {
    await uow.audit.record({
      action: "READ_SENSITIVE",
      entityType: "patient_document",
      entityId: document.id,
      summary: "Documento do paciente aberto",
      metadata: {
        variant: wantsOriginal ? "original" : "converted",
        disposition: attachment ? "attachment" : "inline",
      },
    });
    return ok(undefined);
  });
  return ok({ url, expiresInSeconds: SIGNED_URL_SECONDS });
}

// Corrects the title and the category of an uploaded document. The uploader or a manager may do it;
// a generated document is the record of what was issued and cannot change. A clinical document stays
// clinical whatever the new category says.
export async function updateDocument(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number; clinical: boolean }>> {
  const parsed = parseInput(updateDocumentSchema, input);
  if (!parsed.ok) return parsed;
  const { documentId, title, categoryId, version } = parsed.value;
  const found = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.patientDocument.findFirst({ where: { id: documentId } })),
  );
  if (!found.ok) return found;
  const document = found.value;
  if (!document) return fail(DocumentsErrors.notFound());
  const access = await requireDocumentAccess(deps, ctx, document, "document:read");
  if (!access.ok) return access;
  if (document.kind === "GENERATED") return fail(DocumentsErrors.generatedReadOnly());
  if (document.authorUserId !== ctx.user.id && !canManageDocuments(ctx)) {
    await recordDenial(ctx, "document:read", document.id);
    return fail(CommonErrors.forbidden());
  }
  const now = deps.clock();

  try {
    return await withTransaction(ctx, async (uow) => {
      const category = await uow.tx.documentCategory.findFirst({ where: { id: categoryId, active: true } });
      if (!category || category.systemKey === ISSUED_CATEGORY_KEY)
        return fail(DocumentsErrors.categoryInvalid());
      const clinical = nextClinicalFlag(document.isClinical, category.isClinical);
      const updated = await uow.tx.patientDocument.updateMany({
        where: { id: documentId, version },
        data: { title, categoryId, isClinical: clinical, version: { increment: 1 } },
      });
      if (updated.count === 0) return fail(DocumentsErrors.stale());
      await uow.audit.record({
        action: "UPDATE",
        entityType: "patient_document",
        entityId: documentId,
        summary: "Documento do paciente corrigido",
        // A title can name an exam: it is recorded as changed, with lengths, never as text.
        changes: diffChanges(
          { title: document.title, categoryId: document.categoryId, clinical: document.isClinical },
          { title, categoryId, clinical },
          { sensitive: ["title"] },
        ),
      });
      await uow.publish(
        documentEvent(
          DOCUMENTS_EVENTS.updated,
          { documentId, patientId: document.patientId, kind: "UPLOADED", clinical, actorUserId: ctx.user.id },
          now,
        ),
      );
      return ok({ version: version + 1, clinical });
    });
  } catch (error) {
    if (isClinicalFlagViolation(error)) return fail(DocumentsErrors.stale());
    throw error;
  }
}

// Archiving hides a document from the default list, with a mandatory reason (PRD F08).
export async function archiveDocument(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ archivedAt: string; version: number }>> {
  const parsed = parseInput(archiveDocumentSchema, input);
  if (!parsed.ok) return parsed;
  const { documentId, reason, version } = parsed.value;
  const found = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.patientDocument.findFirst({ where: { id: documentId } })),
  );
  if (!found.ok) return found;
  const document = found.value;
  if (!document) return fail(DocumentsErrors.notFound());
  const access = await requireDocumentAccess(deps, ctx, document, "document:archive");
  if (!access.ok) return access;
  if (document.archivedAt) return fail(DocumentsErrors.alreadyArchived());
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    const updated = await uow.tx.patientDocument.updateMany({
      where: { id: documentId, version, archivedAt: null },
      data: { archivedAt: now, archivedById: ctx.user.id, archiveReason: reason, version: { increment: 1 } },
    });
    if (updated.count === 0) return fail(DocumentsErrors.stale());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "patient_document",
      entityId: documentId,
      summary: "Documento do paciente arquivado",
      metadata: { reasonLength: reason.length },
    });
    await uow.publish(
      documentEvent(
        DOCUMENTS_EVENTS.archived,
        {
          documentId,
          patientId: document.patientId,
          kind: document.kind as "UPLOADED" | "GENERATED",
          clinical: document.isClinical,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok({ archivedAt: now.toISOString(), version: version + 1 });
  });
}

export async function restoreDocument(
  deps: DocumentsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number }>> {
  const parsed = parseInput(restoreDocumentSchema, input);
  if (!parsed.ok) return parsed;
  const { documentId, version } = parsed.value;
  const found = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.patientDocument.findFirst({ where: { id: documentId } })),
  );
  if (!found.ok) return found;
  const document = found.value;
  if (!document) return fail(DocumentsErrors.notFound());
  const access = await requireDocumentAccess(deps, ctx, document, "document:archive");
  if (!access.ok) return access;
  if (!document.archivedAt) return fail(DocumentsErrors.notArchived());
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    const updated = await uow.tx.patientDocument.updateMany({
      where: { id: documentId, version, archivedAt: { not: null } },
      data: { archivedAt: null, archivedById: null, archiveReason: null, version: { increment: 1 } },
    });
    if (updated.count === 0) return fail(DocumentsErrors.stale());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "patient_document",
      entityId: documentId,
      summary: "Documento do paciente restaurado",
    });
    await uow.publish(
      documentEvent(
        DOCUMENTS_EVENTS.restored,
        {
          documentId,
          patientId: document.patientId,
          kind: document.kind as "UPLOADED" | "GENERATED",
          clinical: document.isClinical,
          actorUserId: ctx.user.id,
        },
        now,
      ),
    );
    return ok({ version: version + 1 });
  });
}
