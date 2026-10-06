import type { DomainError } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { ClinicalErrors } from "./errors";
import { LOCK_WINDOW_MS, NOTE_MAX_CHARACTERS } from "./limits";

// The clinical note aggregate (architecture section 4: rich module). Every change goes through a
// method that enforces the lifecycle of PRD F07: draft → finalized → locked (24 hours after the
// creation). The repository persists the props together with the pending version row, and the
// database trigger (ADR-032) refuses late content changes even if this code had a bug.

export const NOTE_KINDS = ["ENCOUNTER", "STANDALONE"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
export type NoteStatus = "DRAFT" | "FINALIZED";
// LOCKED is derived from the lock instant, never stored.
export type NoteState = NoteStatus | "LOCKED";

// Sanitized HTML, its plain text and the length of that text (spec F07 section 3).
export type NoteContent = { html: string; text: string; characters: number };

export type ClinicalNoteProps = {
  id: string;
  organizationId: string;
  patientId: string;
  appointmentId: string | null;
  kind: NoteKind;
  professionalId: string;
  authorUserId: string;
  status: NoteStatus;
  content: NoteContent;
  createdAt: Date;
  locksAt: Date;
  finalizedAt: Date | null;
  finalizedById: string | null;
  autoFinalized: boolean;
  editDraft: NoteContent | null;
  editStartedAt: Date | null;
  // Versions stored so far (replaced contents).
  versionCount: number;
  // Optimistic lock, incremented by the repository on every save.
  version: number;
};

// A version row to insert together with the note: the content that an edit replaced.
export type PendingVersion = { versionNumber: number; content: NoteContent; replacedById: string };

export type StartInput = {
  id: string;
  organizationId: string;
  patientId: string;
  appointmentId: string | null;
  professionalId: string;
  authorUserId: string;
  content: NoteContent;
  now: Date;
};

function checkLength(content: NoteContent): DomainError | null {
  return content.characters > NOTE_MAX_CHARACTERS ? ClinicalErrors.noteTooLong() : null;
}

export class ClinicalNote {
  private pendingVersion: PendingVersion | null = null;

  private constructor(private props: ClinicalNoteProps) {}

  // The first save creates the note as a draft and starts the 24-hour clock (spec F07 section 3).
  static start(input: StartInput): Result<ClinicalNote> {
    const tooLong = checkLength(input.content);
    if (tooLong) return fail(tooLong);
    return ok(
      new ClinicalNote({
        id: input.id,
        organizationId: input.organizationId,
        patientId: input.patientId,
        appointmentId: input.appointmentId,
        kind: input.appointmentId ? "ENCOUNTER" : "STANDALONE",
        professionalId: input.professionalId,
        authorUserId: input.authorUserId,
        status: "DRAFT",
        content: input.content,
        createdAt: input.now,
        locksAt: new Date(input.now.getTime() + LOCK_WINDOW_MS),
        finalizedAt: null,
        finalizedById: null,
        autoFinalized: false,
        editDraft: null,
        editStartedAt: null,
        versionCount: 0,
        version: 1,
      }),
    );
  }

  static restore(props: ClinicalNoteProps): ClinicalNote {
    return new ClinicalNote({ ...props });
  }

  get snapshot(): Readonly<ClinicalNoteProps> {
    return this.props;
  }

  takePendingVersion(): PendingVersion | null {
    const pending = this.pendingVersion;
    this.pendingVersion = null;
    return pending;
  }

  // PRD F07: after 24 hours the note is locked, whatever its stored status.
  effectiveState(now: Date): NoteState {
    return now.getTime() >= this.props.locksAt.getTime() ? "LOCKED" : this.props.status;
  }

  isLocked(now: Date): boolean {
    return this.effectiveState(now) === "LOCKED";
  }

  // Attachments and edits are open while the note is not locked (spec F07 section 3).
  isEditable(now: Date): boolean {
    return !this.isLocked(now);
  }

  // Colleagues see a note once it is finalized, or locked (an expired draft is finalized by the
  // job, and reads must not wait for it).
  isVisibleToOthers(now: Date): boolean {
    return this.props.status === "FINALIZED" || this.isLocked(now);
  }

  isAuthor(userId: string): boolean {
    return this.props.authorUserId === userId;
  }

  private guardAuthor(userId: string): DomainError | null {
    return this.isAuthor(userId) ? null : ClinicalErrors.notAuthor();
  }

  saveDraft(userId: string, content: NoteContent, now: Date): Result<void> {
    const notAuthor = this.guardAuthor(userId);
    if (notAuthor) return fail(notAuthor);
    if (this.isLocked(now)) return fail(ClinicalErrors.noteLocked());
    if (this.props.status !== "DRAFT") return fail(ClinicalErrors.noteAlreadyFinalized());
    const tooLong = checkLength(content);
    if (tooLong) return fail(tooLong);
    this.props = { ...this.props, content };
    return ok(undefined);
  }

  finalize(userId: string, content: NoteContent, now: Date): Result<void> {
    if (content.text.trim().length === 0) return fail(ClinicalErrors.noteEmpty());
    const saved = this.saveDraft(userId, content, now);
    if (!saved.ok) return saved;
    this.props = { ...this.props, status: "FINALIZED", finalizedAt: now, finalizedById: userId };
    return ok(undefined);
  }

  // "Editar": copies the published content into an edit draft only the author sees. Idempotent.
  startEdit(userId: string, now: Date): Result<void> {
    const notAuthor = this.guardAuthor(userId);
    if (notAuthor) return fail(notAuthor);
    if (this.isLocked(now)) return fail(ClinicalErrors.noteLocked());
    if (this.props.status !== "FINALIZED") return fail(ClinicalErrors.noteNotFinalized());
    if (this.props.editDraft) return ok(undefined);
    this.props = { ...this.props, editDraft: this.props.content, editStartedAt: now };
    return ok(undefined);
  }

  private guardEditing(userId: string, now: Date): DomainError | null {
    const notAuthor = this.guardAuthor(userId);
    if (notAuthor) return notAuthor;
    if (this.isLocked(now)) return ClinicalErrors.noteLocked();
    if (this.props.status !== "FINALIZED") return ClinicalErrors.noteNotFinalized();
    if (!this.props.editDraft) return ClinicalErrors.noEditInProgress();
    return null;
  }

  saveEditDraft(userId: string, content: NoteContent, now: Date): Result<void> {
    const blocked = this.guardEditing(userId, now);
    if (blocked) return fail(blocked);
    const tooLong = checkLength(content);
    if (tooLong) return fail(tooLong);
    this.props = { ...this.props, editDraft: content };
    return ok(undefined);
  }

  // "Salvar alterações": the replaced content becomes a version, the draft becomes current.
  publishEdit(userId: string, content: NoteContent, now: Date): Result<PendingVersion> {
    const blocked = this.guardEditing(userId, now);
    if (blocked) return fail(blocked);
    const tooLong = checkLength(content);
    if (tooLong) return fail(tooLong);
    if (content.text.trim().length === 0) return fail(ClinicalErrors.noteEmpty());
    const pending: PendingVersion = {
      versionNumber: this.props.versionCount + 1,
      content: this.props.content,
      replacedById: userId,
    };
    this.pendingVersion = pending;
    this.props = {
      ...this.props,
      content,
      editDraft: null,
      editStartedAt: null,
      versionCount: pending.versionNumber,
    };
    return ok(pending);
  }

  discardEdit(userId: string, now: Date): Result<void> {
    const blocked = this.guardEditing(userId, now);
    if (blocked) return fail(blocked);
    this.props = { ...this.props, editDraft: null, editStartedAt: null };
    return ok(undefined);
  }

  // Run by the job once the lock instant has passed (PRD F07 clarified by spec F07): a draft is
  // finalized automatically, and an edit still pending is discarded.
  autoFinalize(now: Date): { finalized: boolean; discardedEdit: boolean } {
    if (!this.isLocked(now)) return { finalized: false, discardedEdit: false };
    let finalized = false;
    let discardedEdit = false;
    if (this.props.status === "DRAFT") {
      this.props = {
        ...this.props,
        status: "FINALIZED",
        finalizedAt: now,
        finalizedById: null,
        autoFinalized: true,
      };
      finalized = true;
    }
    if (this.props.editDraft) {
      this.props = { ...this.props, editDraft: null, editStartedAt: null };
      discardedEdit = true;
    }
    return { finalized, discardedEdit };
  }
}
