import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPE_GROUPS } from "./entity-types";
import { actorOptions, organizationTimeZone } from "./queries";
import type { AuditDeps } from "./search-events";
import type { AuditFilterOptions } from "./views";

// ListAuditFilterOptions (spec F15 assumption 6): every user of the organization, active and
// inactive, by name; the actions and the entity types with their groups.
export async function listFilterOptions(
  deps: AuditDeps,
  ctx: RequestContext,
): Promise<Result<AuditFilterOptions>> {
  const allowed = await authorize(ctx, "audit:read");
  if (!allowed.ok) return allowed;
  const loaded = await withTransaction(ctx, async (uow) => {
    const [users, timeZone] = await Promise.all([
      actorOptions(uow, ctx.organizationId),
      organizationTimeZone(uow, ctx.organizationId),
    ]);
    return ok({ users, timeZone });
  });
  if (!loaded.ok) return loaded;
  const { users, timeZone } = loaded.value;
  return ok({
    users: users.map((user) => ({ id: user.id, name: user.name, active: user.status === "ACTIVE" })),
    actions: [...AUDIT_ACTIONS],
    entityTypeGroups: AUDIT_ENTITY_TYPE_GROUPS.map((group) => ({ key: group.key, types: [...group.types] })),
    timeZone,
    today: dateInTimeZone(deps.clock(), timeZone),
  });
}
