import type { UnitOfWork } from "@/shared/db/transaction";

// Read-only SQL of the audit log viewer (spec F15 section 6, ADR-039). `AuditEvent` is not a tenant
// model (its organization is nullable for anonymous sign-in failures), so every query filters
// `organization_id` explicitly; the UTC window lets the planner prune the monthly partitions.

export type AuditActorFilter = { kind: "ALL" } | { kind: "SYSTEM" } | { kind: "USER"; userId: string };

export type AuditQueryScope = {
  organizationId: string;
  windowStart: Date;
  windowEnd: Date;
  actor: AuditActorFilter;
  action: string | null;
  entityType: string | null;
  entityId: string | null;
};

export type AuditKey = { occurredAt: string; id: string };

export type AuditEventRow = {
  id: string;
  occurred_at: Date;
  // The instant with the database's microseconds, for the keyset cursor.
  occurred_key: string;
  actor_type: "USER" | "SYSTEM" | "ANONYMOUS";
  actor_user_id: string | null;
  actor_name: string | null;
  actor_status: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  has_changes: boolean;
  // Filled only when the query is asked for the detail columns (export batches and the detail).
  changes: unknown;
  metadata: unknown;
  ip_address: string | null;
  request_id: string | null;
  subject_anonymized: boolean;
};

// "Anything but a UUID" is not cast, so a malformed metadata value can never break a query.
const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

function actorParams(actor: AuditActorFilter): { actorKind: string; actorUserId: string | null } {
  return { actorKind: actor.kind, actorUserId: actor.kind === "USER" ? actor.userId : null };
}

// One page (or export batch) newest first, after the keyset position `after`. The patient join
// (spec F15 decision D14) runs only with `detail`, after the LIMIT, by primary key.
export async function listEvents(
  uow: UnitOfWork,
  scope: AuditQueryScope,
  options: { limit: number; after: AuditKey | null; detail: boolean },
): Promise<AuditEventRow[]> {
  const { organizationId, windowStart, windowEnd, action, entityType, entityId } = scope;
  const { actorKind, actorUserId } = actorParams(scope.actor);
  const afterAt = options.after?.occurredAt ?? null;
  const afterId = options.after?.id ?? null;
  return uow.tx.$queryRaw<AuditEventRow[]>`
    WITH page AS (
      SELECT e.id, e.occurred_at, e.organization_id, e.actor_type, e.actor_user_id, e.action,
             e.entity_type, e.entity_id, e.summary, e.changes, e.metadata, e.ip_address, e.request_id
      FROM audit_event e
      WHERE e.organization_id = ${organizationId}::uuid
        AND e.occurred_at >= ${windowStart} AND e.occurred_at < ${windowEnd}
        AND (${actorKind}::text = 'ALL'
          OR (${actorKind}::text = 'SYSTEM' AND e.actor_type = 'SYSTEM')
          OR (${actorKind}::text = 'USER' AND e.actor_user_id = ${actorUserId}::uuid))
        AND (${action}::text IS NULL OR e.action = ${action}::text)
        AND (${entityType}::text IS NULL OR e.entity_type = ${entityType}::text)
        AND (${entityId}::uuid IS NULL OR e.entity_id = ${entityId}::uuid)
        -- The plain bound lets the index start at the cursor; the row comparison breaks ties.
        AND (${afterAt}::timestamptz IS NULL OR e.occurred_at <= ${afterAt}::timestamptz)
        AND (${afterAt}::timestamptz IS NULL
          OR (e.occurred_at, e.id) < (${afterAt}::timestamptz, ${afterId}::uuid))
      ORDER BY e.occurred_at DESC, e.id DESC
      LIMIT ${options.limit}
    )
    SELECT p.id, p.occurred_at,
           to_char(p.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_key,
           p.actor_type, p.actor_user_id, u.name AS actor_name, u.status AS actor_status,
           p.action, p.entity_type, p.entity_id, p.summary,
           (p.changes IS NOT NULL AND jsonb_typeof(p.changes) = 'object' AND p.changes <> '{}'::jsonb) AS has_changes,
           CASE WHEN ${options.detail}::boolean THEN p.changes END AS changes,
           CASE WHEN ${options.detail}::boolean THEN p.metadata END AS metadata,
           CASE WHEN ${options.detail}::boolean THEN host(p.ip_address) END AS ip_address,
           CASE WHEN ${options.detail}::boolean THEN p.request_id END AS request_id,
           (pt.anonymized_at IS NOT NULL) AS subject_anonymized
    FROM page p
    LEFT JOIN app_user u ON u.id = p.actor_user_id
    LEFT JOIN patient pt ON ${options.detail}::boolean
      AND pt.organization_id = p.organization_id
      AND pt.id = CASE
        WHEN p.entity_type = 'patient' THEN p.entity_id
        WHEN p.metadata->>'patientId' ~ ${UUID_PATTERN} THEN (p.metadata->>'patientId')::uuid
      END
    ORDER BY p.occurred_at DESC, p.id DESC`;
}

// Spec F15 decision D3: the number of matching events, counted up to `cap` only.
export async function cappedCount(uow: UnitOfWork, scope: AuditQueryScope, cap: number): Promise<number> {
  const { organizationId, windowStart, windowEnd, action, entityType, entityId } = scope;
  const { actorKind, actorUserId } = actorParams(scope.actor);
  const rows = await uow.tx.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total FROM (
      SELECT 1
      FROM audit_event e
      WHERE e.organization_id = ${organizationId}::uuid
        AND e.occurred_at >= ${windowStart} AND e.occurred_at < ${windowEnd}
        AND (${actorKind}::text = 'ALL'
          OR (${actorKind}::text = 'SYSTEM' AND e.actor_type = 'SYSTEM')
          OR (${actorKind}::text = 'USER' AND e.actor_user_id = ${actorUserId}::uuid))
        AND (${action}::text IS NULL OR e.action = ${action}::text)
        AND (${entityType}::text IS NULL OR e.entity_type = ${entityType}::text)
        AND (${entityId}::uuid IS NULL OR e.entity_id = ${entityId}::uuid)
      LIMIT ${cap}
    ) matched`;
  return rows[0]?.total ?? 0;
}

// One event of the organization, with the detail columns (the primary key is searched per partition).
export async function eventById(
  uow: UnitOfWork,
  organizationId: string,
  eventId: string,
): Promise<AuditEventRow | null> {
  const rows = await uow.tx.$queryRaw<AuditEventRow[]>`
    SELECT e.id, e.occurred_at,
           to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_key,
           e.actor_type, e.actor_user_id, u.name AS actor_name, u.status AS actor_status,
           e.action, e.entity_type, e.entity_id, e.summary,
           (e.changes IS NOT NULL AND jsonb_typeof(e.changes) = 'object' AND e.changes <> '{}'::jsonb) AS has_changes,
           e.changes, e.metadata, host(e.ip_address) AS ip_address, e.request_id,
           (pt.anonymized_at IS NOT NULL) AS subject_anonymized
    FROM audit_event e
    LEFT JOIN app_user u ON u.id = e.actor_user_id
    LEFT JOIN patient pt ON pt.organization_id = e.organization_id
      AND pt.id = CASE
        WHEN e.entity_type = 'patient' THEN e.entity_id
        WHEN e.metadata->>'patientId' ~ ${UUID_PATTERN} THEN (e.metadata->>'patientId')::uuid
      END
    WHERE e.organization_id = ${organizationId}::uuid AND e.id = ${eventId}::uuid
    LIMIT 1`;
  return rows[0] ?? null;
}

export type ActorOptionRow = { id: string; name: string; status: string };

// Every user of the organization, active and inactive, by name (spec F15 assumption 6).
export async function actorOptions(uow: UnitOfWork, organizationId: string): Promise<ActorOptionRow[]> {
  return uow.tx.$queryRaw<ActorOptionRow[]>`
    SELECT id, name, status FROM app_user WHERE organization_id = ${organizationId}::uuid ORDER BY name, id`;
}

export async function userExists(uow: UnitOfWork, organizationId: string, userId: string): Promise<boolean> {
  const rows = await uow.tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM app_user WHERE organization_id = ${organizationId}::uuid AND id = ${userId}::uuid`;
  return rows.length > 0;
}

// Audit events have no unit: their dates are read in the organization's time zone (decision D4).
export async function organizationTimeZone(uow: UnitOfWork, organizationId: string): Promise<string> {
  const rows = await uow.tx.$queryRaw<{ time_zone: string }[]>`
    SELECT time_zone FROM organization WHERE id = ${organizationId}::uuid`;
  return rows[0]?.time_zone ?? "America/Sao_Paulo";
}
