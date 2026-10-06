"use server";

import { redirect } from "next/navigation";
import { identity } from "@/modules/identity";
import {
  applySetCookies,
  getRequestContext,
  getRequestMeta,
  withRequestContext,
} from "@/modules/identity/next";
import type { Locale } from "@/shared/i18n/locales";
import { toActionResult, type ActionResult } from "@/shared/kernel/action-result";

export async function signOutAction(): Promise<void> {
  const ctx = await getRequestContext();
  if (ctx) await applySetCookies(await identity.signOut(ctx, await getRequestMeta()));
  redirect("/login");
}

// The user's own interface language (PRD F16); the client refreshes the page afterwards.
export async function setUserLocaleAction(locale: Locale): Promise<ActionResult<{ locale: Locale }>> {
  return withRequestContext(async (ctx) =>
    toActionResult(await identity.setUserLocale(ctx, { locale }), ctx.locale, "identity"),
  );
}
