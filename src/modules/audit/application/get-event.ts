import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { auditText } from "./display";
import { AuditErrors } from "./errors";
import { presentChanges, presentMetadata } from "./present-changes";
import { eventById, organizationTimeZone } from "./queries";
import { entityIdSchema } from "./schemas";
import type { AuditDeps } from "./search-events";
import { actorView, type AuditEventDetail } from "./views";

// GetAuditEvent (PRD F15): one event of the organization with its field-level diff. Clinical changes
// show only their character counts and the personal fields of an anonymized patient are masked
// (spec F15 decisions D7 and D14). Opening a detail is not audited (decision D11).
export async function getEvent(
  _deps: AuditDeps,
  ctx: RequestContext,
  eventId: string,
): Promise<Result<AuditEventDetail>> {
  const allowed = await authorize(ctx, "audit:read");
  if (!allowed.ok) return allowed;
  // A malformed id cannot name an event, so it reads as not found.
  const id = entityIdSchema.safeParse(eventId);
  if (!id.success) return fail(AuditErrors.eventNotFound());

  const loaded = await withTransaction(ctx, async (uow) => {
    const [row, timeZone] = await Promise.all([
      eventById(uow, ctx.organizationId, id.data),
      organizationTimeZone(uow, ctx.organizationId),
    ]);
    return ok({ row, timeZone });
  });
  if (!loaded.ok) return loaded;
  const { row, timeZone } = loaded.value;
  if (!row) return fail(AuditErrors.eventNotFound());

  const text = auditText(ctx.locale, timeZone);
  return ok({
    id: row.id,
    occurredAt: row.occurred_at.toISOString(),
    actor: actorView(row),
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: text.summary(row),
    hasChanges: row.has_changes,
    ipAddress: row.ip_address,
    requestId: row.request_id,
    changes: presentChanges(row.changes, { subjectAnonymized: row.subject_anonymized }, text.display),
    metadata: presentMetadata(row.metadata, text.display),
    timeZone,
  });
}
