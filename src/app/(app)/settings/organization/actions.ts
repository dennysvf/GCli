"use server";

import { identity, identityMessages } from "@/modules/identity";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

export async function updateOrganizationAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await identity.updateOrganization(ctx, input), identityMessages),
  );
}

export async function uploadOrganizationLogoAction(data: FormData) {
  return withRequestContext(async (ctx) => {
    const file = data.get("file");
    const bytes = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
    const type = file instanceof File ? file.type : "";
    return toActionResult(await identity.uploadOrganizationLogo(ctx, { bytes, type }), identityMessages);
  });
}

export async function removeOrganizationLogoAction() {
  return withRequestContext(async (ctx) =>
    toActionResult(await identity.removeOrganizationLogo(ctx), identityMessages),
  );
}
