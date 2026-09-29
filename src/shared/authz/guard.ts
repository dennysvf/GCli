import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { can, type Action } from "./permissions";

// Every use case starts with this check (architecture 5.2). A denial is recorded as
// PERMISSION_DENIED in its own transaction, so it survives the rollback of the denied operation.
export async function recordDenial(ctx: RequestContext, action: Action, target?: string): Promise<void> {
  await withTransaction(ctx, async (uow) => {
    await uow.audit.record({ action: "PERMISSION_DENIED", metadata: { permission: action, target } });
    return ok(undefined);
  });
}

export async function authorize(ctx: RequestContext, action: Action): Promise<Result<void>> {
  if (can(ctx, action)) return ok(undefined);
  await recordDenial(ctx, action);
  return fail(CommonErrors.forbidden());
}
