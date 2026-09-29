"use server";

import { identity, identityMessages } from "@/modules/identity";
import { applySetCookies, getRequestMeta } from "@/modules/identity/next";
import { toActionResult, type ActionResult } from "@/shared/kernel/action-result";
import { ok } from "@/shared/kernel/result";

export async function signInAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  const result = await identity.signIn(input, await getRequestMeta());
  if (!result.ok) return toActionResult(result, identityMessages);
  await applySetCookies(result.value.setCookies);
  return toActionResult(ok({ redirectTo: result.value.redirectTo }), identityMessages);
}
