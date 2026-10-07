import { objectStorage } from "@/shared/storage/object-storage";
import type { DocumentStorage } from "../application/ports";
import { SIGNED_URL_SECONDS } from "../domain/limits";

// Documents on the private bucket (ADR-009, ADR-031). Browser-facing URLs expire in 5 minutes
// (PRD F08) and are signed against the public endpoint.
export const documentStorage: DocumentStorage = {
  presignUpload: (key, contentType, size) =>
    objectStorage().presignBrowserPut(key, contentType, size, SIGNED_URL_SECONDS),
  presignDownload: (key, options) => objectStorage().presignBrowserGet(key, SIGNED_URL_SECONDS, options),
  async head(key) {
    const head = await objectStorage().head(key);
    return head ? { size: head.size } : null;
  },
  reader: (key, size) => ({
    size,
    read: (start, length) => objectStorage().getRange(key, length, start),
  }),
  async get(key) {
    const stored = await objectStorage().get(key);
    return stored ? stored.body : null;
  },
  put: (key, body, contentType) => objectStorage().put(key, body, contentType),
  delete: (key) => objectStorage().delete(key),
};
