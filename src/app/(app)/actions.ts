"use server";

import { redirect } from "next/navigation";
import { identity } from "@/modules/identity";
import { applySetCookies, getRequestContext, getRequestMeta } from "@/modules/identity/next";

export async function signOutAction(): Promise<void> {
  const ctx = await getRequestContext();
  if (ctx) await applySetCookies(await identity.signOut(ctx, await getRequestMeta()));
  redirect("/login");
}
