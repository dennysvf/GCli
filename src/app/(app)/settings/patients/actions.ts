"use server";

import { withRequestContext } from "@/modules/identity/next";
import { patients, patientsMessages } from "@/modules/patients";
import { toActionResult } from "@/shared/kernel/action-result";

export async function createListItemAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.createListItem(ctx, input), patientsMessages),
  );
}

export async function renameListItemAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.renameListItem(ctx, input), patientsMessages),
  );
}

export async function setListItemActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.setListItemActive(ctx, input), patientsMessages),
  );
}
