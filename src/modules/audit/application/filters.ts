import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { decodeCursor } from "./cursor";
import { AuditErrors } from "./errors";
import { resolveAuditPeriod, type AuditPeriod } from "./period";
import { organizationTimeZone, userExists, type AuditKey, type AuditQueryScope } from "./queries";
import { auditFiltersSchema, entityIdSchema, type AuditFilters } from "./schemas";

export type PreparedFilters = {
  scope: AuditQueryScope;
  period: AuditPeriod;
  filters: AuditFilters;
  after: AuditKey | null;
  timeZone: string;
};

// The filters of a search or an export, checked and resolved against the organization (spec F15
// section 5). Called after the authorization check of each use case.
export async function prepareFilters(
  ctx: RequestContext,
  input: unknown,
  now: Date,
): Promise<Result<PreparedFilters>> {
  const parsed = parseInput(auditFiltersSchema, input ?? {});
  if (!parsed.ok) return parsed;
  const values = parsed.value;

  // Spec F15 decision D6: an entity id only makes sense with its type.
  if (values.entityId !== undefined && values.entityType === "ALL")
    return fail(AuditErrors.entityTypeRequired());
  let entityId: string | null = null;
  if (values.entityId !== undefined) {
    const id = entityIdSchema.safeParse(values.entityId);
    if (!id.success) return fail(CommonErrors.validationFailed({ entityId: "audit.validation.invalidId" }));
    entityId = id.data.toLowerCase();
  }
  let after: AuditKey | null = null;
  if (values.cursor !== undefined) {
    after = decodeCursor(values.cursor);
    if (!after) return fail(CommonErrors.validationFailed({ cursor: "audit.validation.invalidCursor" }));
  }

  const userId = values.user === "ALL" || values.user === "SYSTEM" ? null : values.user.toLowerCase();
  const context = await withTransaction(ctx, async (uow) =>
    ok({
      timeZone: await organizationTimeZone(uow, ctx.organizationId),
      userKnown: userId === null || (await userExists(uow, ctx.organizationId, userId)),
    }),
  );
  if (!context.ok) return context;
  const { timeZone, userKnown } = context.value;
  if (!userKnown) return fail(CommonErrors.validationFailed({ user: "audit.validation.invalidUser" }));

  const period = resolveAuditPeriod(
    { from: values.from, to: values.to },
    dateInTimeZone(now, timeZone),
    timeZone,
  );
  if (!period.ok) return period;

  const filters: AuditFilters = {
    from: period.value.from,
    to: period.value.to,
    user: userId ?? values.user,
    action: values.action,
    entityType: values.entityType,
    ...(entityId ? { entityId } : {}),
  };
  return ok({
    scope: {
      organizationId: ctx.organizationId,
      windowStart: period.value.windowStart,
      windowEnd: period.value.windowEnd,
      actor: userId
        ? { kind: "USER", userId }
        : values.user === "SYSTEM"
          ? { kind: "SYSTEM" }
          : { kind: "ALL" },
      action: values.action === "ALL" ? null : values.action,
      entityType: values.entityType === "ALL" ? null : values.entityType,
      entityId,
    },
    period: period.value,
    filters,
    after,
    timeZone,
  });
}
