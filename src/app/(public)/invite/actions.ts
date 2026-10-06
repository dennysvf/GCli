"use server";

import { identity } from "@/modules/identity";
import { applySetCookies, getRequestMeta } from "@/modules/identity/next";
import { resolveRequestLocale } from "@/i18n/locale";
import { toActionResult, type ActionResult } from "@/shared/kernel/action-result";
import { ok } from "@/shared/kernel/result";

export async function acceptInvitationAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  const result = await identity.acceptInvitation(input, await getRequestMeta());
  if (!result.ok) return toActionResult(result, await resolveRequestLocale(null), "identity");
  await applySetCookies(result.value.setCookies);
  return toActionResult(
    ok({ redirectTo: result.value.redirectTo }),
    await resolveRequestLocale(null),
    "identity",
  );
}
