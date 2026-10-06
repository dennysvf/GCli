import { objectStorage } from "@/shared/storage/object-storage";
import type { AttachmentStorage } from "../application/ports";
import { SIGNED_URL_SECONDS } from "../domain/limits";

// Clinical files on the private bucket (ADR-009, ADR-031). Browser-facing URLs expire in 5 minutes
// (PRD F07) and are signed against the public endpoint.
export const attachmentStorage: AttachmentStorage = {
  presignUpload: (key, contentType, size) =>
    objectStorage().presignBrowserPut(key, contentType, size, SIGNED_URL_SECONDS),
  presignDownload: (key, options) => objectStorage().presignBrowserGet(key, SIGNED_URL_SECONDS, options),
  async head(key) {
    const head = await objectStorage().head(key);
    return head ? { size: head.size } : null;
  },
  firstBytes: (key, length) => objectStorage().getRange(key, length),
  async get(key) {
    const stored = await objectStorage().get(key);
    return stored ? stored.body : null;
  },
  put: (key, body, contentType) => objectStorage().put(key, body, contentType),
  delete: (key) => objectStorage().delete(key),
};
