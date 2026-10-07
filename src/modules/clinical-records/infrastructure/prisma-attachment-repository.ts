import type { AttachmentRepository, AttachmentRow } from "../application/ports";
import type { AttachmentStatus, AttachmentType } from "../domain/attachment";

type Row = {
  id: string;
  noteId: string;
  uploadedById: string;
  fileName: string;
  sourceContentType: string;
  sourceObjectKey: string;
  objectKey: string | null;
  contentType: string | null;
  thumbnailKey: string | null;
  sizeBytes: number;
  status: string;
  markedInErrorAt: Date | null;
  createdAt: Date;
};

function toRow(row: Row): AttachmentRow {
  return {
    id: row.id,
    noteId: row.noteId,
    uploadedById: row.uploadedById,
    fileName: row.fileName,
    sourceContentType: row.sourceContentType as AttachmentType,
    sourceObjectKey: row.sourceObjectKey,
    objectKey: row.objectKey,
    contentType: row.contentType,
    thumbnailKey: row.thumbnailKey,
    sizeBytes: row.sizeBytes,
    status: row.status as AttachmentStatus,
    markedInErrorAt: row.markedInErrorAt,
    createdAt: row.createdAt,
  };
}

export const prismaAttachmentRepository: AttachmentRepository = {
  async list(uow, noteId) {
    const rows = await uow.tx.clinicalAttachment.findMany({
      where: { noteId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toRow);
  },

  async find(uow, id) {
    const row = await uow.tx.clinicalAttachment.findFirst({ where: { id } });
    return row ? toRow(row) : null;
  },

  countActive: (uow, noteId) => uow.tx.clinicalAttachment.count({ where: { noteId, markedInErrorAt: null } }),

  async insert(uow, row, actor) {
    await uow.tx.clinicalAttachment.create({ data: { ...row, organizationId: actor.organizationId } });
  },

  async update(uow, id, changes) {
    await uow.tx.clinicalAttachment.updateMany({ where: { id }, data: changes });
  },

  async createIntent(uow, row, actor) {
    await uow.tx.clinicalAttachmentUpload.create({ data: { ...row, organizationId: actor.organizationId } });
  },

  async findIntent(uow, id) {
    const row = await uow.tx.clinicalAttachmentUpload.findFirst({ where: { id } });
    return row
      ? {
          id: row.id,
          noteId: row.noteId,
          userId: row.userId,
          objectKey: row.objectKey,
          fileName: row.fileName,
          declaredContentType: row.declaredContentType,
          declaredSize: row.declaredSize,
          expiresAt: row.expiresAt,
          consumedAt: row.consumedAt,
          attachmentId: row.attachmentId,
        }
      : null;
  },

  async consumeIntent(uow, id, attachmentId, now) {
    await uow.tx.clinicalAttachmentUpload.updateMany({
      where: { id },
      data: { consumedAt: now, attachmentId },
    });
  },
};
