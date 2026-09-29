import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { ok } from "@/shared/kernel/result";
import { sessionState, shouldTouchSession } from "../domain/policies";
import type { IdentityDeps, RequestMeta } from "./ports";

// Resolves the signed-in user for a request (spec F01 section 4, "Request context"). Returns null
// when there is no valid session: idle for 60 minutes, older than 12 hours, or user inactive.
export async function resolveRequestContext(
  deps: IdentityDeps,
  meta: RequestMeta,
): Promise<RequestContext | null> {
  const session = await deps.auth.getSession(meta.headers);
  if (!session) return null;
  const now = deps.clock();

  if (sessionState(session, now) !== "active") {
    await deps.directory.deleteSession(session.id);
    return null;
  }
  const user = await deps.directory.findUserById(session.userId);
  if (!user || user.status !== "ACTIVE") {
    await deps.directory.deleteSession(session.id);
    return null;
  }
  if (shouldTouchSession(session.lastActiveAt, now)) await deps.directory.touchSession(session.id, now);

  return {
    kind: "user",
    requestId: meta.requestId,
    organizationId: user.organizationId,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    sessionId: session.id,
    linkedProfessionalId: null,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  };
}

export async function signOut(deps: IdentityDeps, ctx: RequestContext, meta: RequestMeta): Promise<string[]> {
  const setCookies = await deps.auth.signOut(meta.headers);
  await deps.directory.deleteSession(ctx.sessionId);
  await withTransaction(ctx, async (uow) => {
    await uow.audit.record({ action: "LOGOUT", entityType: "user", entityId: ctx.user.id });
    return ok(undefined);
  });
  return setCookies;
}
