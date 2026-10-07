import type { RequestContext } from "@/shared/context/types";
import type { UnitOfWork } from "@/shared/db/transaction";
import type { AttachmentStatus, AttachmentType } from "../domain/attachment";
import type { ClinicalNote } from "../domain/clinical-note";

// Ports of the clinical-records module (rich tier, architecture section 4). Repositories are
// implemented with Prisma in ../infrastructure; the directory reads the public APIs of the modules
// F07 consumes (PRD F07 Consumes), wired in ../index.ts.

// Who writes: the organization fills the tenant column, the user the author columns.
export type Actor = { userId: string; organizationId: string };

export type SaveOutcome = "OK" | "STALE" | "LOCKED";

export type NoteListRow = {
  id: string;
  kind: "ENCOUNTER" | "STANDALONE";
  appointmentId: string | null;
  professionalId: string;
  authorUserId: string;
  status: "DRAFT" | "FINALIZED";
  autoFinalized: boolean;
  previewText: string;
  createdAt: Date;
  locksAt: Date;
  addendaCount: number;
};

export type AddendumRow = {
  id: string;
  authorUserId: string;
  professionalId: string;
  contentHtml: string;
  characters: number;
  createdAt: Date;
};

export type VersionRow = {
  id: string;
  versionNumber: number;
  contentHtml: string;
  characters: number;
  replacedAt: Date;
  replacedById: string;
};

export interface NoteRepository {
  findById(uow: UnitOfWork, id: string): Promise<ClinicalNote | null>;
  findByAppointment(uow: UnitOfWork, appointmentId: string): Promise<ClinicalNote | null>;
  // Inserts a new note. DUPLICATE means the appointment already has one (PRD: one note per appointment).
  insert(uow: UnitOfWork, note: ClinicalNote, actor: Actor): Promise<"OK" | "DUPLICATE">;
  // Updates with the version check and writes the pending version row. LOCKED is the database
  // trigger refusing a late content change (ADR-032).
  save(uow: UnitOfWork, note: ClinicalNote, expectedVersion: number, actor: Actor): Promise<SaveOutcome>;
  // Locks the note row for the rest of the transaction (serializes attachment confirmations).
  lock(uow: UnitOfWork, noteId: string, organizationId: string): Promise<void>;
  // Notes a viewer may see: finalized or locked ones from anyone, plus the viewer's own drafts.
  listVisible(
    uow: UnitOfWork,
    query: { patientId: string; viewerUserId: string; now: Date; skip: number; take: number },
  ): Promise<{ rows: NoteListRow[]; total: number }>;
  // State of the note of each appointment, as scheduling shows it (spec F07 section 3): finalized or
  // locked notes are FINALIZED, and a draft is reported to its author only.
  statesForAppointments(
    organizationId: string,
    appointmentIds: string[],
    viewerUserId: string,
    now: Date,
  ): Promise<Map<string, "DRAFT" | "FINALIZED">>;
  addenda(uow: UnitOfWork, noteId: string): Promise<AddendumRow[]>;
  insertAddendum(
    uow: UnitOfWork,
    addendum: {
      id: string;
      noteId: string;
      authorUserId: string;
      professionalId: string;
      contentHtml: string;
      contentText: string;
      characters: number;
    },
    actor: Actor,
  ): Promise<void>;
  versions(uow: UnitOfWork, noteId: string): Promise<VersionRow[]>;
  findVersion(uow: UnitOfWork, versionId: string): Promise<(VersionRow & { noteId: string }) | null>;
}

export type AttachmentRow = {
  id: string;
  noteId: string;
  uploadedById: string;
  fileName: string;
  sourceContentType: AttachmentType;
  sourceObjectKey: string;
  objectKey: string | null;
  contentType: string | null;
  thumbnailKey: string | null;
  sizeBytes: number;
  status: AttachmentStatus;
  markedInErrorAt: Date | null;
  createdAt: Date;
};

export type UploadIntentRow = {
  id: string;
  noteId: string;
  userId: string;
  objectKey: string;
  fileName: string;
  declaredContentType: string;
  declaredSize: number;
  expiresAt: Date;
  consumedAt: Date | null;
  attachmentId: string | null;
};

export interface AttachmentRepository {
  list(uow: UnitOfWork, noteId: string): Promise<AttachmentRow[]>;
  find(uow: UnitOfWork, id: string): Promise<AttachmentRow | null>;
  // Attachments that count against the limit (not marked in error).
  countActive(uow: UnitOfWork, noteId: string): Promise<number>;
  insert(uow: UnitOfWork, row: Omit<AttachmentRow, "createdAt">, actor: Actor): Promise<void>;
  update(
    uow: UnitOfWork,
    id: string,
    changes: Partial<
      Pick<AttachmentRow, "objectKey" | "contentType" | "thumbnailKey" | "status" | "markedInErrorAt">
    > & { markedInErrorById?: string | null },
  ): Promise<void>;
  createIntent(
    uow: UnitOfWork,
    row: Omit<UploadIntentRow, "consumedAt" | "attachmentId">,
    actor: Actor,
  ): Promise<void>;
  findIntent(uow: UnitOfWork, id: string): Promise<UploadIntentRow | null>;
  consumeIntent(uow: UnitOfWork, id: string, attachmentId: string, now: Date): Promise<void>;
}

export type ClinicalAlertRow = { id: string; text: string; version: number };

export interface AlertRepository {
  find(uow: UnitOfWork, patientId: string): Promise<ClinicalAlertRow | null>;
  create(
    uow: UnitOfWork,
    row: { id: string; patientId: string; text: string },
    actor: Actor,
  ): Promise<"OK" | "DUPLICATE">;
  update(
    uow: UnitOfWork,
    row: { id: string; text: string; previousText: string; expectedVersion: number },
    actor: Actor,
  ): Promise<"OK" | "STALE">;
}

// Sanitizes editor HTML against the allowlist and derives the plain text (ADR-032).
export interface HtmlSanitizer {
  sanitize(html: string): { html: string; text: string };
}

// Private object storage, browser-facing URLs signed against the public endpoint (ADR-031).
export interface AttachmentStorage {
  presignUpload(key: string, contentType: string, size: number): Promise<string>;
  presignDownload(key: string, options?: { contentDisposition?: string }): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  firstBytes(key: string, length: number): Promise<Uint8Array | null>;
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ImageProcessor {
  heicToJpeg(input: Uint8Array): Promise<Uint8Array>;
  // JPEG thumbnail without metadata.
  thumbnail(input: Uint8Array): Promise<Uint8Array>;
}

// --- Data from the modules F07 consumes -------------------------------------------------------

export type AppointmentFacts = {
  id: string;
  patientId: string;
  professionalId: string;
  serviceId: string;
  serviceName: string;
  unitId: string;
  unitTimeZone: string;
  startsAt: string;
  status: string;
};

export type AppointmentListFacts = {
  startsAt: string;
  serviceName: string;
  professionalId: string;
  unitTimeZone: string;
};

export interface ClinicalDirectory {
  appointment(organizationId: string, appointmentId: string): Promise<AppointmentFacts | null>;
  appointments(organizationId: string, ids: string[]): Promise<Map<string, AppointmentListFacts>>;
  relation(
    organizationId: string,
    professionalId: string,
    patientId: string,
    now: Date,
  ): Promise<{ hasAnyAppointment: boolean; hasAttendedPastAppointment: boolean }>;
  patient(
    ctx: RequestContext,
    patientId: string,
  ): Promise<{ displayName: string; age: number | null } | null>;
  professionalNames(ctx: RequestContext, ids: string[]): Promise<Map<string, string>>;
  userNames(ctx: RequestContext, ids: string[]): Promise<Map<string, string>>;
  organizationTimeZone(ctx: RequestContext): Promise<string>;
}

export type ClinicalRecordsDeps = {
  notes: NoteRepository;
  attachments: AttachmentRepository;
  alerts: AlertRepository;
  sanitizer: HtmlSanitizer;
  storage: AttachmentStorage;
  images: ImageProcessor;
  directory: ClinicalDirectory;
  clock: () => Date;
};
