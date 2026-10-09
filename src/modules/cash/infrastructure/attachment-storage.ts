import { objectStorage } from "@/shared/storage/object-storage";
import type { AttachmentStorage } from "../application/ports";

// Receipts on the private bucket (ADR-009, ADR-031). Browser-facing URLs expire quickly: the upload
// in 10 minutes, the download in 5 (spec F11 section 5).
const UPLOAD_SECONDS = 600;
const DOWNLOAD_SECONDS = 300;

function disposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export const attachmentStorage: AttachmentStorage = {
  presignUpload: (key, contentType, size) =>
    objectStorage().presignBrowserPut(key, contentType, size, UPLOAD_SECONDS),
  presignDownload: (key, fileName) =>
    objectStorage().presignBrowserGet(key, DOWNLOAD_SECONDS, { contentDisposition: disposition(fileName) }),
  delete: (key) => objectStorage().delete(key),
};
