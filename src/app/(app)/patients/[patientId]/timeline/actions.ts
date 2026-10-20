"use server";

import { withRequestContext } from "@/modules/identity/next";
import { privacy } from "@/modules/privacy";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of the patient timeline (spec F14 section 5). Each one only translates the result:
// authorization, role filtering and the audited reads live in the use cases.

export async function listTimelineAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await privacy.getPatientTimeline(ctx, input), ctx.locale, "privacy"),
  );
}

export async function openTimelineNoteAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await privacy.getTimelineNote(ctx, input), ctx.locale, "privacy"),
  );
}
