import type { ActionResult } from "@/shared/kernel/action-result";
import type { AddendumResult } from "../application/addenda";
import type { AlertResult } from "../application/alerts";
import type { AttachmentSummary } from "../application/attachments";
import type { EditResult, FinalizeResult, PublishResult, SaveResult } from "../application/notes";
import type { NoteDetails, NoteListPage, VersionItem } from "../application/queries";

// The Server Actions the record screen calls (spec F07 section 5). The route passes them in, so
// the module's UI never imports route code.
export type RecordActions = {
  saveDraft: (input: unknown) => Promise<ActionResult<SaveResult>>;
  finalize: (input: unknown) => Promise<ActionResult<FinalizeResult>>;
  startEdit: (input: unknown) => Promise<ActionResult<EditResult>>;
  saveEditDraft: (input: unknown) => Promise<ActionResult<SaveResult>>;
  publishEdit: (input: unknown) => Promise<ActionResult<PublishResult>>;
  discardEdit: (input: unknown) => Promise<ActionResult<{ version: number }>>;
  addAddendum: (input: unknown) => Promise<ActionResult<AddendumResult>>;
  openNote: (input: { noteId: string }) => Promise<ActionResult<NoteDetails>>;
  listNotes: (input: { patientId: string; page: number }) => Promise<ActionResult<NoteListPage>>;
  listVersions: (input: { noteId: string }) => Promise<ActionResult<VersionItem[]>>;
  getVersion: (input: {
    versionId: string;
  }) => Promise<ActionResult<{ id: string; versionNumber: number; html: string; replacedAt: string }>>;
  confirmAttachment: (input: { uploadId: string }) => Promise<ActionResult<AttachmentSummary>>;
  markAttachmentInError: (input: {
    attachmentId: string;
  }) => Promise<ActionResult<{ markedInErrorAt: string }>>;
  updateAlert: (input: {
    patientId: string;
    text: string;
    version: number;
  }) => Promise<ActionResult<AlertResult>>;
};
