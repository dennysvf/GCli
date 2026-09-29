import { createAuditWriter, type AuditWriter } from "@/shared/audit/audit-writer";
import type { AnyContext } from "@/shared/context/types";
import { EventBus, type DomainEvent } from "@/shared/events/event-bus";
import { createOutbox, type Outbox } from "@/shared/events/outbox";
import type { Result } from "@/shared/kernel/result";
import { forTenant, type TenantTx } from "./tenant";

// Unit of work handed to use cases: a tenant-scoped transaction client plus the audit writer,
// outbox and event publisher bound to the same transaction (spec F01 section 4).
export type UnitOfWork = {
  tx: TenantTx;
  audit: AuditWriter;
  outbox: Outbox;
  publish(event: DomainEvent): Promise<void>;
};

// Anonymous flows (sign-in, invitation acceptance) run before the organization is known; their
// tenant-scoped queries must match nothing until they switch to the resolved organization.
const NO_TENANT = "00000000-0000-0000-0000-000000000000";

export const eventBus = new EventBus<UnitOfWork>();

class RollbackSignal<T> extends Error {
  constructor(readonly result: Result<T>) {
    super("rollback");
  }
}

// Runs fn in one transaction. A failed Result rolls back every write made by fn.
export async function withTransaction<T>(
  ctx: AnyContext,
  fn: (uow: UnitOfWork) => Promise<Result<T>>,
): Promise<Result<T>> {
  const organizationId = ctx.organizationId;
  const client = organizationId ? forTenant(organizationId) : forTenant(NO_TENANT);
  try {
    return await client.$transaction(async (tx) => {
      const uow: UnitOfWork = {
        tx,
        audit: createAuditWriter(tx, ctx),
        outbox: createOutbox(tx, organizationId),
        publish: (event) => eventBus.publish(event, uow),
      };
      const result = await fn(uow);
      if (!result.ok) throw new RollbackSignal(result);
      return result;
    });
  } catch (error) {
    if (error instanceof RollbackSignal) return error.result as Result<T>;
    throw error;
  }
}
