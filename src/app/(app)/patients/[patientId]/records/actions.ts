"use server";

import { clinicalRecords } from "@/modules/clinical-records";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Actions of the clinical record (spec F07 section 5). Each one only translates the
// result: authorization, validation, audit and events live in the use cases.

export async function saveDraftAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.saveDraft(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function finalizeNoteAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.finalizeNote(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function startEditAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.startEdit(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function saveEditDraftAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.saveEditDraft(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function publishEditAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.publishEdit(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function discardEditAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.discardEdit(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function addAddendumAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.addAddendum(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function openNoteAction(input: { noteId: string }) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.getNote(ctx, input.noteId), ctx.locale, "clinicalRecords"),
  );
}

export async function listNotesAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.listPatientNotes(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function listVersionsAction(input: { noteId: string }) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.listVersions(ctx, input.noteId), ctx.locale, "clinicalRecords"),
  );
}

export async function getVersionAction(input: { versionId: string }) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.getVersion(ctx, input.versionId), ctx.locale, "clinicalRecords"),
  );
}

export async function confirmAttachmentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.confirmAttachment(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function markAttachmentInErrorAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.markAttachmentInError(ctx, input), ctx.locale, "clinicalRecords"),
  );
}

export async function updateClinicalAlertAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await clinicalRecords.updateClinicalAlert(ctx, input), ctx.locale, "clinicalRecords"),
  );
}
