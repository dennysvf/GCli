import { objectStorage } from "@/shared/storage/object-storage";
import type { FileStore } from "../application/ports";

// FileStore on the private S3-compatible bucket (ADR-009, ADR-023). Downloads use 5-minute links.
export const objectFileStore: FileStore = {
  put: (key, body, contentType) => objectStorage().put(key, body, contentType),
  head: (key) => objectStorage().head(key),
  presignGet: (key) => objectStorage().presignGet(key, 300),
  delete: (key) => objectStorage().delete(key),
};
