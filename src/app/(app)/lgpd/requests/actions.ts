"use server";

import { withRequestContext } from "@/modules/identity/next";
import { privacy } from "@/modules/privacy";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of the LGPD request register (spec F14 section 5). Each one only translates the
// result: authorization (lgpd:manage), validation, audit and the outbox live in the use cases.

export async function createRequestAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await privacy.createRequest(ctx, input), ctx.locale, "privacy"),
  );
}

export async function completeRequestAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await privacy.completeRequest(ctx, input), ctx.locale, "privacy"),
  );
}

export async function requestExportAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await privacy.requestExport(ctx, input), ctx.locale, "privacy"),
  );
}

export async function downloadExportAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await privacy.getExportDownload(ctx, input), ctx.locale, "privacy"),
  );
}

export async function previewAnonymizationAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await privacy.previewAnonymization(ctx, input), ctx.locale, "privacy"),
  );
}

export async function anonymizePatientAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await privacy.anonymizePatient(ctx, input), ctx.locale, "privacy"),
  );
}
