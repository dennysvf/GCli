// Next.js entry point of the identity module: request context for pages and Server Actions.
import "server-only";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { recordDenial } from "@/shared/authz/guard";
import { can, type Action } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { toActionResult, type ActionResult } from "@/shared/kernel/action-result";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail } from "@/shared/kernel/result";
import { identity } from "./index";
import { identityMessages } from "./messages";
import { applySetCookies, getRequestMeta } from "./infrastructure/next";

// Resolved once per request (React cache).
export const getRequestContext = cache(async (): Promise<RequestContext | null> => {
  return identity.resolveRequestContext(await getRequestMeta());
});

// For pages under (app): without a valid session the user goes to the login page and comes back
// to the same path afterwards. The proxy forwards the current path in x-pathname.
export async function requireRequestContext(): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (!ctx) {
    const path = (await headers()).get("x-pathname");
    const params = new URLSearchParams({ reason: "expired" });
    if (path && path !== "/") params.set("next", path);
    redirect(`/login?${params.toString()}`);
  }
  return ctx;
}

// For pages that need a permission (any of the given actions): renders the 403 page and records
// PERMISSION_DENIED.
export async function requirePermission(...anyOf: [Action, ...Action[]]): Promise<RequestContext> {
  const ctx = await requireRequestContext();
  if (!anyOf.some((action) => can(ctx, action))) {
    await recordDenial(ctx, anyOf[0], (await headers()).get("x-pathname") ?? undefined);
    forbidden();
  }
  return ctx;
}

export { applySetCookies, getRequestMeta };

// Wraps a Server Action body that needs a signed-in user. An expired session yields
// AUTH_UNAUTHENTICATED, which the client turns into a redirect to /login (draft preserved).
export async function withRequestContext<T>(
  fn: (ctx: RequestContext) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const ctx = await getRequestContext();
  if (!ctx) return toActionResult(fail(CommonErrors.unauthenticated()), identityMessages);
  return fn(ctx);
}
