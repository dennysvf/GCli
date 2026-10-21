import type { PresentedChange, PresentedMetadata } from "./present-changes";
import type { AuditEventRow } from "./queries";
import type { AuditFilters } from "./schemas";

// Shapes returned by the audit use cases and the read endpoints (spec F15 section 5).

export type AuditActorView = {
  type: "USER" | "SYSTEM" | "ANONYMOUS";
  userId: string | null;
  // Null for system and anonymous events; the client writes "Sistema" or "Anônimo".
  name: string | null;
  active: boolean;
};

export type AuditEventItem = {
  id: string;
  occurredAt: string;
  actor: AuditActorView;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  hasChanges: boolean;
};

export type AuditPage = {
  period: { from: string; to: string };
  filters: AuditFilters;
  items: AuditEventItem[];
  nextCursor: string | null;
  matched: { count: number; capped: boolean };
  pageSize: number;
  exportLimit: number;
  timeZone: string;
};

export type AuditEventDetail = AuditEventItem & {
  ipAddress: string | null;
  requestId: string | null;
  changes: PresentedChange[];
  metadata: PresentedMetadata[];
  timeZone: string;
};

export type AuditUserOption = { id: string; name: string; active: boolean };

export type AuditFilterOptions = {
  users: AuditUserOption[];
  actions: string[];
  entityTypeGroups: { key: string; types: string[] }[];
  timeZone: string;
  today: string;
};

export function actorView(row: AuditEventRow): AuditActorView {
  return {
    type: row.actor_type,
    userId: row.actor_user_id,
    name: row.actor_type === "USER" ? row.actor_name : null,
    active: row.actor_type === "USER" ? row.actor_status === "ACTIVE" : true,
  };
}
