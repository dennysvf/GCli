import { DOCX_CONTENT_TYPE } from "@/shared/kernel/file-types";
import { FILE_NAME_MAX, MAX_FILE_BYTES, TITLE_MAX } from "./limits";

// File rules of uploaded documents (PRD F08 Capabilities): PDF, JPG, PNG, HEIC and DOCX.

export const UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  DOCX_CONTENT_TYPE,
] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];
export type DocumentStatus = "PROCESSING" | "READY" | "FAILED";

// Types a client may declare; HEIF is the same container family and is stored as HEIC.
const DECLARED_TYPES: Record<string, UploadType> = {
  "application/pdf": "application/pdf",
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/heic": "image/heic",
  "image/heif": "image/heic",
  [DOCX_CONTENT_TYPE]: DOCX_CONTENT_TYPE,
};

export function declaredUploadType(contentType: string): UploadType | null {
  return DECLARED_TYPES[contentType.toLowerCase()] ?? null;
}

export function isUploadType(value: string): value is UploadType {
  return (UPLOAD_TYPES as readonly string[]).includes(value);
}

export function isFileSizeAllowed(size: number): boolean {
  return Number.isInteger(size) && size >= 1 && size <= MAX_FILE_BYTES;
}

// The original name is kept up to 255 characters, cleaned of control characters. It is stored in
// the database and never used in object keys or logs.
export function cleanFileName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "arquivo").slice(0, FILE_NAME_MAX);
}

// The title of an upload defaults to the file name without its extension.
export function titleFromFileName(name: string): string {
  const cleaned = cleanFileName(name);
  const dot = cleaned.lastIndexOf(".");
  const base = dot > 0 ? cleaned.slice(0, dot) : cleaned;
  return (base.trim() || cleaned).slice(0, TITLE_MAX);
}

// Images and PDFs open in the preview modal; DOCX is download-only (ADR-033).
export function isPreviewable(contentType: string | null): boolean {
  return contentType === "application/pdf" || contentType === "image/jpeg" || contentType === "image/png";
}

// A converted HEIC is served as JPEG, so previews need the served type, not the original one.
export function servedFileName(fileName: string, servedType: string | null, sourceType: string): string {
  if (sourceType === "image/heic" && servedType === "image/jpeg") {
    const dot = fileName.lastIndexOf(".");
    return `${dot > 0 ? fileName.slice(0, dot) : fileName}.jpg`;
  }
  return fileName;
}
