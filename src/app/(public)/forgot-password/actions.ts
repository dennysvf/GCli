"use server";

import { identity, identityMessages, PASSWORD_RESET_REQUESTED_MESSAGE } from "@/modules/identity";
import { getRequestMeta } from "@/modules/identity/next";
import { toActionResult, type ActionResult } from "@/shared/kernel/action-result";
import { ok } from "@/shared/kernel/result";

export async function requestPasswordResetAction(input: unknown): Promise<ActionResult<{ message: string }>> {
  const result = await identity.requestPasswordReset(input, await getRequestMeta());
  if (!result.ok) return toActionResult(result, identityMessages);
  return toActionResult(ok({ message: PASSWORD_RESET_REQUESTED_MESSAGE }), identityMessages);
}
