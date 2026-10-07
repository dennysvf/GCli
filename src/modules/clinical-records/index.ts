// Public API of the clinical-records module (spec F07 section 5).
import { scheduling } from "@/modules/scheduling";
import type { RequestContext } from "@/shared/context/types";
import { addAddendum } from "./application/addenda";
import { updateClinicalAlert } from "./application/alerts";
import {
  confirmAttachment,
  createUploadIntent,
  markAttachmentFailed,
  markAttachmentInError,
  openAttachment,
  processAttachment,
} from "./application/attachments";
import { autoFinalizeNote } from "./application/maintenance";
import {
  discardEdit,
  finalizeNote,
  publishEdit,
  saveDraft,
  saveEditDraft,
  startEdit,
} from "./application/notes";
import { canAccessPatientRecords } from "./application/policies";
import type { ClinicalRecordsDeps } from "./application/ports";
import { createClinicalNoteLookup } from "./application/provided";
import {
  getClinicalRecord,
  getNote,
  getVersion,
  listPatientNotes,
  listVersions,
} from "./application/queries";
import { attachmentStorage } from "./infrastructure/attachment-storage";
import { clinicalDirectory } from "./infrastructure/directory";
import { sanitizeHtmlAdapter } from "./infrastructure/html-sanitizer";
import { imageProcessor } from "./infrastructure/image-processor";
import { prismaAlertRepository } from "./infrastructure/prisma-alert-repository";
import { prismaAttachmentRepository } from "./infrastructure/prisma-attachment-repository";
import { prismaNoteRepository } from "./infrastructure/prisma-note-repository";

const deps: ClinicalRecordsDeps = {
  notes: prismaNoteRepository,
  attachments: prismaAttachmentRepository,
  alerts: prismaAlertRepository,
  sanitizer: sanitizeHtmlAdapter,
  storage: attachmentStorage,
  images: imageProcessor,
  directory: clinicalDirectory,
  clock: () => new Date(),
};

export const clinicalRecords = {
  // Reads (every one is audited)
  getClinicalRecord: (ctx: RequestContext, input: unknown) => getClinicalRecord(deps, ctx, input),
  getNote: (ctx: RequestContext, noteId: string) => getNote(deps, ctx, noteId),
  listPatientNotes: (ctx: RequestContext, input: unknown) => listPatientNotes(deps, ctx, input),
  listVersions: (ctx: RequestContext, noteId: string) => listVersions(deps, ctx, noteId),
  getVersion: (ctx: RequestContext, versionId: string) => getVersion(deps, ctx, versionId),
  canAccessPatientRecords: (ctx: RequestContext, patientId: string) =>
    canAccessPatientRecords(deps, ctx, patientId),
  // Notes
  saveDraft: (ctx: RequestContext, input: unknown) => saveDraft(deps, ctx, input),
  finalizeNote: (ctx: RequestContext, input: unknown) => finalizeNote(deps, ctx, input),
  startEdit: (ctx: RequestContext, input: unknown) => startEdit(deps, ctx, input),
  saveEditDraft: (ctx: RequestContext, input: unknown) => saveEditDraft(deps, ctx, input),
  publishEdit: (ctx: RequestContext, input: unknown) => publishEdit(deps, ctx, input),
  discardEdit: (ctx: RequestContext, input: unknown) => discardEdit(deps, ctx, input),
  addAddendum: (ctx: RequestContext, input: unknown) => addAddendum(deps, ctx, input),
  // Attachments and alerts
  createUploadIntent: (ctx: RequestContext, input: unknown) => createUploadIntent(deps, ctx, input),
  confirmAttachment: (ctx: RequestContext, input: unknown) => confirmAttachment(deps, ctx, input),
  markAttachmentInError: (ctx: RequestContext, input: unknown) => markAttachmentInError(deps, ctx, input),
  openAttachment: (ctx: RequestContext, input: unknown) => openAttachment(deps, ctx, input),
  updateClinicalAlert: (ctx: RequestContext, input: unknown) => updateClinicalAlert(deps, ctx, input),
  // Worker
  processAttachment: (input: { organizationId: string; attachmentId: string }) =>
    processAttachment(deps, input),
  markAttachmentFailed: (input: { organizationId: string; attachmentId: string }) =>
    markAttachmentFailed(deps, input),
  autoFinalizeNote: (input: { organizationId: string; noteId: string }) => autoFinalizeNote(deps, input),
};

// The clinical note lookup that scheduling declared (F06), registered once per process by
// src/composition.ts (ADR-022).
export function registerClinicalRecordsPorts(): void {
  scheduling.registerClinicalNoteLookup(createClinicalNoteLookup(deps));
}

export { clinicalRecordsCatalog } from "./messages/catalog";
export { CLINICAL_RECORDS_EVENTS, type ClinicalEventPayload } from "./domain/events";
export { AUTOSAVE_INTERVAL_MS, AUTOSAVE_RETRY_MS, LIST_PAGE_SIZE as NOTES_PAGE_SIZE } from "./domain/limits";
export type { NoteState } from "./domain/clinical-note";
export type {
  AttachmentItem,
  ClinicalRecord,
  NoteDetails,
  NoteListItem,
  NoteListPage,
  RecordCurrent,
  VersionItem,
} from "./application/queries";
export type { SaveResult, FinalizeResult, EditResult, PublishResult } from "./application/notes";
export type { AddendumResult } from "./application/addenda";
export type { AlertResult } from "./application/alerts";
export type { AttachmentSummary, UploadIntentResult } from "./application/attachments";
export { ClinicalRecordView } from "./ui/clinical-record-view";
export { ClinicalNotesTable } from "./ui/clinical-notes-table";
export type { RecordActions } from "./ui/record-actions";
