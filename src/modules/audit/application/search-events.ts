import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { ok, type Result } from "@/shared/kernel/result";
import { encodeCursor } from "./cursor";
import { auditText } from "./display";
import { prepareFilters } from "./filters";
import { AUDIT_COUNT_CAP, AUDIT_CSV_MAX_ROWS, AUDIT_PAGE_SIZE } from "./limits";
import { cappedCount, listEvents } from "./queries";
import { actorView, type AuditPage } from "./views";

export type AuditDeps = { clock: () => Date };

// SearchAuditEvents (PRD F15): one page of 100 events newest first, with a capped count of every
// matching event. Searches are not audited (spec F15 decision D11); a denial is, by `authorize`.
export async function searchEvents(
  deps: AuditDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<AuditPage>> {
  const allowed = await authorize(ctx, "audit:read");
  if (!allowed.ok) return allowed;
  const prepared = await prepareFilters(ctx, input, deps.clock());
  if (!prepared.ok) return prepared;
  const { scope, period, filters, after, timeZone } = prepared.value;

  const data = await withTransaction(ctx, async (uow) => {
    const [rows, count] = await Promise.all([
      // One row past the page tells whether a next page exists.
      listEvents(uow, scope, { limit: AUDIT_PAGE_SIZE + 1, after, detail: false }),
      cappedCount(uow, scope, AUDIT_COUNT_CAP),
    ]);
    return ok({ rows, count });
  });
  if (!data.ok) return data;
  const { rows, count } = data.value;

  const text = auditText(ctx.locale, timeZone);
  const pageRows = rows.slice(0, AUDIT_PAGE_SIZE);
  const last = pageRows.at(-1);
  return ok({
    period: { from: period.from, to: period.to },
    filters,
    items: pageRows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at.toISOString(),
      actor: actorView(row),
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      summary: text.summary(row),
      hasChanges: row.has_changes,
    })),
    nextCursor:
      rows.length > AUDIT_PAGE_SIZE && last
        ? encodeCursor({ occurredAt: last.occurred_key, id: last.id })
        : null,
    matched: { count: Math.min(count, AUDIT_COUNT_CAP), capped: count >= AUDIT_COUNT_CAP },
    pageSize: AUDIT_PAGE_SIZE,
    exportLimit: AUDIT_CSV_MAX_ROWS,
    timeZone,
  });
}
