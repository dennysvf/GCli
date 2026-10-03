"use server";

import { identity } from "@/modules/identity";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

export async function inviteUserAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await identity.inviteUser(ctx, input), ctx.locale, "identity"),
  );
}

export async function resendInvitationAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await identity.resendInvitation(ctx, input), ctx.locale, "identity"),
  );
}

export async function revokeInvitationAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await identity.revokeInvitation(ctx, input), ctx.locale, "identity"),
  );
}

export async function changeUserRoleAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await identity.changeUserRole(ctx, input), ctx.locale, "identity"),
  );
}

export async function deactivateUserAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await identity.deactivateUser(ctx, input), ctx.locale, "identity"),
  );
}

export async function reactivateUserAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await identity.reactivateUser(ctx, input), ctx.locale, "identity"),
  );
}
