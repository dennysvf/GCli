// Public API of the audit module. Recording lives in src/shared/audit (used inside every
// transaction); this module is the read side, the F15 viewer (spec F15 section 5, ADR-039). Callers
// never import files inside the module.
import type { RequestContext } from "@/shared/context/types";
import { exportEvents } from "./application/export-events";
import { getEvent } from "./application/get-event";
import { listFilterOptions } from "./application/list-filter-options";
import { searchEvents, type AuditDeps } from "./application/search-events";

const baseDeps: AuditDeps = { clock: () => new Date() };

// The use cases bound to their dependencies. `adjust` lets tests replace the clock.
export function createAudit(adjust?: (base: AuditDeps) => AuditDeps) {
  const deps = adjust ? adjust(baseDeps) : baseDeps;
  return {
    searchEvents: (ctx: RequestContext, input: unknown) => searchEvents(deps, ctx, input),
    getEvent: (ctx: RequestContext, eventId: string) => getEvent(deps, ctx, eventId),
    exportEvents: (ctx: RequestContext, input: unknown) => exportEvents(deps, ctx, input),
    listFilterOptions: (ctx: RequestContext) => listFilterOptions(deps, ctx),
  };
}

export const audit = createAudit();

export { ensureAuditPartitions, MONTHS_AHEAD } from "./infrastructure/partitions";
export {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPE_GROUPS,
  AUDIT_ENTITY_TYPES,
  AUDIT_LOG_ENTITY_TYPE,
  isAuditAction,
} from "./application/entity-types";
export {
  AUDIT_CSV_MAX_ROWS,
  AUDIT_DEFAULT_PERIOD_DAYS,
  AUDIT_MAX_PERIOD_DAYS,
  AUDIT_PAGE_SIZE,
} from "./application/limits";
export type { AuditDeps } from "./application/search-events";
export type { AuditExport } from "./application/export-events";
export type { AuditFilters } from "./application/schemas";
export type { ChangeKind, PresentedChange, PresentedMetadata } from "./application/present-changes";
export type {
  AuditActorView,
  AuditEventDetail,
  AuditEventItem,
  AuditFilterOptions,
  AuditPage,
  AuditUserOption,
} from "./application/views";
export { auditCatalog } from "./messages/catalog";
