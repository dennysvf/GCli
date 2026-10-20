import { LgpdExport, type ExportErrorCode, type ExportStatus } from "../domain/lgpd-export";
import type { ExportRepository } from "../application/ports";

// The exports of the access requests (own table). Model queries are scoped by the tenant extension.

type Row = {
  id: string;
  organizationId: string;
  requestId: string;
  status: string;
  locale: string;
  objectKey: string | null;
  sizeBytes: bigint | null;
  fileCount: number | null;
  errorCode: string | null;
  requestedById: string;
  requestedAt: Date;
  readyAt: Date | null;
  expiresAt: Date | null;
  failedAt: Date | null;
  expiredAt: Date | null;
};

function toEntity(row: Row): LgpdExport {
  return LgpdExport.rehydrate({
    id: row.id,
    organizationId: row.organizationId,
    requestId: row.requestId,
    status: row.status as ExportStatus,
    locale: row.locale,
    objectKey: row.objectKey,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    fileCount: row.fileCount,
    errorCode: row.errorCode as ExportErrorCode | null,
    requestedById: row.requestedById,
    requestedAt: row.requestedAt,
    readyAt: row.readyAt,
    expiresAt: row.expiresAt,
    failedAt: row.failedAt,
    expiredAt: row.expiredAt,
  });
}

export const prismaExportRepository: ExportRepository = {
  async findById(uow, id, options = {}) {
    if (options.lock) await uow.tx.$queryRaw`SELECT id FROM lgpd_export WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await uow.tx.lgpdExport.findFirst({ where: { id } });
    return row ? toEntity(row) : null;
  },

  async listForRequest(uow, requestId) {
    const rows = await uow.tx.lgpdExport.findMany({
      where: { requestId },
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toEntity);
  },

  async readyForPatient(uow, patientId) {
    const rows = await uow.tx.lgpdExport.findMany({
      where: { status: "READY", request: { patientId } },
      orderBy: { requestedAt: "asc" },
    });
    return rows.map(toEntity);
  },

  async readyExpiredBefore(uow, instant, limit) {
    const rows = await uow.tx.lgpdExport.findMany({
      where: { status: "READY", expiresAt: { lte: instant } },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });
    return rows.map(toEntity);
  },

  async insert(uow, item) {
    const props = item.snapshot;
    await uow.tx.lgpdExport.create({
      data: {
        id: props.id,
        organizationId: props.organizationId,
        requestId: props.requestId,
        status: props.status,
        locale: props.locale,
        requestedById: props.requestedById,
        requestedAt: props.requestedAt,
      },
    });
  },

  async save(uow, item) {
    const props = item.snapshot;
    await uow.tx.lgpdExport.update({
      where: { id: props.id },
      data: {
        status: props.status,
        objectKey: props.objectKey,
        sizeBytes: props.sizeBytes === null ? null : BigInt(props.sizeBytes),
        fileCount: props.fileCount,
        errorCode: props.errorCode,
        readyAt: props.readyAt,
        expiresAt: props.expiresAt,
        failedAt: props.failedAt,
        expiredAt: props.expiredAt,
      },
    });
  },
};
