"use server";

import { withRequestContext } from "@/modules/identity/next";
import { patients, patientsMessages } from "@/modules/patients";
import { toActionResult } from "@/shared/kernel/action-result";

export async function publishTermsVersionAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.publishTermsVersion(ctx, input), patientsMessages),
  );
}
