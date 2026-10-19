import {
  LgpdRequest,
  OPEN_STATUSES,
  type LgpdRequestProps,
  type RequesterKind,
  type RequestStatus,
  type RequestType,
} from "../domain/lgpd-request";
import type { RequestRepository } from "../application/ports";

// The request register (own table). Model queries are scoped by the tenant extension; raw SQL filters
// organization_id explicitly.

type Row = {
  id: string;
  organizationId: string;
  patientId: string;
  type: string;
  requestedBy: string;
  description: string;
  status: string;
  resolution: string | null;
  createdById: string;
  createdAt: Date;
  completedAt: Date | null;
  completedById: string | null;
  version: number;
};

function toEntity(row: Row): LgpdRequest {
  return LgpdRequest.rehydrate({
    id: row.id,
    organizationId: row.organizationId,
    patientId: row.patientId,
    type: row.type as RequestType,
    requestedBy: row.requestedBy as RequesterKind,
    description: row.description,
    status: row.status as RequestStatus,
    resolution: row.resolution,
    createdById: row.createdById,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    completedById: row.completedById,
    version: row.version,
  });
}

function columns(props: Readonly<LgpdRequestProps>) {
  return {
    status: props.status,
    resolution: props.resolution,
    completedAt: props.completedAt,
    completedById: props.completedById,
  };
}

type ListRow = {
  id: string;
  organization_id: string;
  patient_id: string;
  type: string;
  requested_by: string;
  description: string;
  status: string;
  resolution: string | null;
  created_by_id: string;
  created_at: Date;
  completed_at: Date | null;
  completed_by_id: string | null;
  version: number;
  full_name: string;
  social_name: string | null;
  total: bigint;
};

const displayName = (fullName: string, socialName: string | null) => socialName?.trim() || fullName;

export const prismaRequestRepository: RequestRepository = {
  async findById(uow, id, options = {}) {
    // The row is locked by id; the scoped read that follows keeps other organizations out.
    if (options.lock) await uow.tx.$queryRaw`SELECT id FROM lgpd_request WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await uow.tx.lgpdRequest.findFirst({ where: { id } });
    return row ? toEntity(row) : null;
  },

  async insert(uow, request) {
    const props = request.snapshot;
    await uow.tx.lgpdRequest.create({
      data: {
        id: props.id,
        organizationId: props.organizationId,
        patientId: props.patientId,
        type: props.type,
        requestedBy: props.requestedBy,
        description: props.description,
        status: props.status,
        resolution: props.resolution,
        createdById: props.createdById,
        createdAt: props.createdAt,
        completedAt: props.completedAt,
        completedById: props.completedById,
        version: props.version,
      },
    });
  },

  async save(uow, request, expectedVersion) {
    const updated = await uow.tx.lgpdRequest.updateMany({
      where: { id: request.id, version: expectedVersion },
      data: { ...columns(request.snapshot), version: { increment: 1 } },
    });
    return updated.count === 1 ? "OK" : "STALE";
  },

  async hasOpenAnonymization(uow, patientId) {
    const count = await uow.tx.lgpdRequest.count({
      where: { patientId, type: "ANONYMIZATION", status: { in: [...OPEN_STATUSES] } },
    });
    return count > 0;
  },

  async list(uow, filter) {
    const open = [...OPEN_STATUSES];
    const statuses: string[] =
      filter.status === "OPEN" ? open : filter.status === "ALL" ? [] : [filter.status];
    const types: string[] = filter.type === "ALL" ? [] : [filter.type];
    const offset = (filter.page - 1) * filter.pageSize;
    // Open requests first, oldest first; then the answered ones, newest first (spec decision D11).
    const rows = await uow.tx.$queryRaw<ListRow[]>`
      SELECT r.id, r.organization_id, r.patient_id, r.type, r.requested_by, r.description, r.status, r.resolution,
             r.created_by_id, r.created_at, r.completed_at, r.completed_by_id, r.version,
             p.full_name, p.social_name, count(*) OVER () AS total
      FROM lgpd_request r
      JOIN patient p ON p.id = r.patient_id AND p.organization_id = r.organization_id
      WHERE r.organization_id = ${filter.organizationId}::uuid
        AND (cardinality(${statuses}::text[]) = 0 OR r.status = ANY(${statuses}::text[]))
        AND (cardinality(${types}::text[]) = 0 OR r.type = ANY(${types}::text[]))
      ORDER BY (r.status = ANY(${open}::text[])) DESC,
               CASE WHEN r.status = ANY(${open}::text[]) THEN r.created_at END ASC,
               r.created_at DESC, r.id
      LIMIT ${filter.pageSize} OFFSET ${offset}`;
    return {
      total: Number(rows[0]?.total ?? 0),
      rows: rows.map((row) => ({
        request: toEntity({
          id: row.id,
          organizationId: row.organization_id,
          patientId: row.patient_id,
          type: row.type,
          requestedBy: row.requested_by,
          description: row.description,
          status: row.status,
          resolution: row.resolution,
          createdById: row.created_by_id,
          createdAt: row.created_at,
          completedAt: row.completed_at,
          completedById: row.completed_by_id,
          version: row.version,
        }),
        patientDisplayName: displayName(row.full_name, row.social_name),
      })),
    };
  },

  async countOpenCreatedBefore(uow, instant) {
    return uow.tx.lgpdRequest.count({
      where: { status: { in: [...OPEN_STATUSES] }, createdAt: { lt: instant } },
    });
  },

  async patientOf(uow, requestId) {
    const row = await uow.tx.lgpdRequest.findFirst({
      where: { id: requestId },
      select: { patientId: true, patient: { select: { fullName: true, socialName: true } } },
    });
    return row
      ? { patientId: row.patientId, displayName: displayName(row.patient.fullName, row.patient.socialName) }
      : null;
  },
};
