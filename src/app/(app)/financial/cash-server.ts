"use server";

import { cash } from "@/modules/cash";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of the cash register (spec F11 section 5). Each one only translates the result:
// authorization, validation, audit and events live in the use cases.
export async function registerDayAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.getRegisterDay(ctx, input), ctx.locale, "cash"),
  );
}

export async function openRegisterAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.openRegister(ctx, input), ctx.locale, "cash"),
  );
}

export async function recordMovementAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.recordMovement(ctx, input), ctx.locale, "cash"),
  );
}

export async function reverseMovementAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.reverseMovement(ctx, input), ctx.locale, "cash"),
  );
}

export async function closeRegisterAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.closeRegister(ctx, input), ctx.locale, "cash"),
  );
}

export async function reopenRegisterAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.reopenRegister(ctx, input), ctx.locale, "cash"),
  );
}

export async function categoriesAction() {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.listCategories(ctx), ctx.locale, "cash"),
  );
}

export async function uploadIntentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.createUploadIntent(ctx, input), ctx.locale, "cash"),
  );
}

export async function downloadUrlAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await cash.getAttachmentDownload(ctx, input), ctx.locale, "cash"),
  );
}
