"use server";

import { documents } from "@/modules/documents";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of the patient documents (spec F08 section 5). Each one only translates the
// result: authorization, validation, audit and events live in the use cases.

export async function confirmDocumentUploadAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.confirmUpload(ctx, input), ctx.locale, "documents"),
  );
}

export async function listDocumentsAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.listPatientDocuments(ctx, input), ctx.locale, "documents"),
  );
}

export async function updateDocumentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.updateDocument(ctx, input), ctx.locale, "documents"),
  );
}

export async function archiveDocumentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.archiveDocument(ctx, input), ctx.locale, "documents"),
  );
}

export async function restoreDocumentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.restoreDocument(ctx, input), ctx.locale, "documents"),
  );
}

export async function getStorageUsageAction() {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.getStorageUsage(ctx), ctx.locale, "documents"),
  );
}

export async function previewDocumentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.previewDocument(ctx, input), ctx.locale, "documents"),
  );
}

export async function generateDocumentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await documents.generateDocument(ctx, input), ctx.locale, "documents"),
  );
}
