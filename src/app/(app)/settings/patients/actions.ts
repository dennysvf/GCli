"use server";

import { withRequestContext } from "@/modules/identity/next";
import { patients } from "@/modules/patients";
import { toActionResult } from "@/shared/kernel/action-result";

export async function createListItemAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.createListItem(ctx, input), ctx.locale, "patients"),
  );
}

export async function renameListItemAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.renameListItem(ctx, input), ctx.locale, "patients"),
  );
}

export async function setListItemActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.setListItemActive(ctx, input), ctx.locale, "patients"),
  );
}
