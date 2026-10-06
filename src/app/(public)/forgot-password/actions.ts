"use server";

import { identity } from "@/modules/identity";
import { getRequestMeta } from "@/modules/identity/next";
import { resolveRequestLocale } from "@/i18n/locale";
import { createTranslator } from "@/shared/i18n/translator";
import { toActionResult, type ActionResult } from "@/shared/kernel/action-result";
import { ok } from "@/shared/kernel/result";

export async function requestPasswordResetAction(input: unknown): Promise<ActionResult<{ message: string }>> {
  const result = await identity.requestPasswordReset(input, await getRequestMeta());
  const locale = await resolveRequestLocale(null);
  if (!result.ok) return toActionResult(result, locale, "identity");
  // The same answer whether the email exists or not (PRD F01), in the visitor's language.
  const message = createTranslator(locale)("identity.auth.forgot.requested");
  return toActionResult(ok({ message }), locale, "identity");
}
