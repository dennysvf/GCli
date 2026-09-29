// Next.js entry point of the identity module: request context for pages and Server Actions.
import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { RequestContext } from "@/shared/context/types";
import { identity } from "./index";
import { applySetCookies, getRequestMeta } from "./infrastructure/next";

// Resolved once per request (React cache).
export const getRequestContext = cache(async (): Promise<RequestContext | null> => {
  return identity.resolveRequestContext(await getRequestMeta());
});

// For pages under (app): unauthenticated visitors go to the login page.
export async function requireRequestContext(returnTo?: string): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (!ctx) redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  return ctx;
}

export { applySetCookies, getRequestMeta };
