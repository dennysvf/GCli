"use server";

import { identity } from "@/modules/identity";
import { getRequestMeta } from "@/modules/identity/next";
import { resolveRequestLocale } from "@/i18n/locale";
import { toActionResult, type ActionResult } from "@/shared/kernel/action-result";

export async function resetPasswordAction(input: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  return toActionResult(
    await identity.resetPassword(input, await getRequestMeta()),
    await resolveRequestLocale(null),
    "identity",
  );
}
