"use server";

import { withRequestContext } from "@/modules/identity/next";
import { scheduling, schedulingMessages } from "@/modules/scheduling";
import { toActionResult } from "@/shared/kernel/action-result";

export async function createReasonAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.createCancellationReason(ctx, input), schedulingMessages),
  );
}

export async function renameReasonAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.renameCancellationReason(ctx, input), schedulingMessages),
  );
}

export async function setReasonActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await scheduling.setCancellationReasonActive(ctx, input), schedulingMessages),
  );
}
