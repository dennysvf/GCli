import { detectFileType } from "@/shared/kernel/file-types";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { ClinicalErrors } from "./errors";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_NOTE, FILE_NAME_MAX, IN_ERROR_WINDOW_MS } from "./limits";

// Attachment rules (PRD F07 Capabilities): PDF, JPG, PNG and HEIC, up to 20 MB and 10 per note.

export const ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];
export type AttachmentStatus = "PROCESSING" | "READY" | "FAILED";

// Types a client may declare; HEIF is the same container family and is stored as HEIC.
const DECLARED_TYPES: Record<string, AttachmentType> = {
  "application/pdf": "application/pdf",
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/heic": "image/heic",
  "image/heif": "image/heic",
};

export function declaredAttachmentType(contentType: string): AttachmentType | null {
  return DECLARED_TYPES[contentType.toLowerCase()] ?? null;
}

// The real type of a file from its first bytes; what the client declared is never trusted. The
// detection is shared with F08 (ADR-033); a ZIP is not an attachment type here.
export function detectAttachmentType(bytes: Uint8Array): AttachmentType | null {
  const detected = detectFileType(bytes);
  return detected === null || detected === "application/zip" ? null : detected;
}

export function checkAttachmentSize(size: number): Result<void> {
  return size >= 1 && size <= ATTACHMENT_MAX_BYTES
    ? ok(undefined)
    : fail(ClinicalErrors.attachmentUnsupported());
}

// activeCount excludes attachments marked in error: they free a place (spec F07 section 3).
export function canAddAttachment(input: { editable: boolean; activeCount: number }): Result<void> {
  if (!input.editable) return fail(ClinicalErrors.attachmentsClosed());
  if (input.activeCount >= ATTACHMENT_MAX_PER_NOTE) return fail(ClinicalErrors.attachmentLimit());
  return ok(undefined);
}

export function canMarkInError(input: {
  actorUserId: string;
  uploadedById: string;
  uploadedAt: Date;
  alreadyMarked: boolean;
  now: Date;
}): Result<void> {
  if (input.actorUserId !== input.uploadedById) return fail(ClinicalErrors.notAuthor());
  if (input.alreadyMarked) return ok(undefined);
  if (input.now.getTime() - input.uploadedAt.getTime() >= IN_ERROR_WINDOW_MS) {
    return fail(ClinicalErrors.errorWindowExpired());
  }
  return ok(undefined);
}

// Spec F07: the original name is kept up to 255 characters, cleaned of control characters, and is
// never used in object keys or logs.
export function cleanFileName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "arquivo").slice(0, FILE_NAME_MAX);
}
