// Public API of the documents module (spec F08 section 5). Use cases are wired here with their
// infrastructure adapters; callers never import files inside the module.
import { sanitizeRichText } from "@/shared/rich-text/sanitizer";
import { sharedImageProcessor } from "@/shared/storage/image-processor";
import type { DocumentsDeps } from "./application/ports";
import { documentsDirectory } from "./infrastructure/directory";
import { reactPdfDocumentRenderer } from "./infrastructure/pdf-renderer";
import { documentStorage } from "./infrastructure/storage";

export const documentsDeps: DocumentsDeps = {
  storage: documentStorage,
  images: { heicToJpeg: (input) => sharedImageProcessor.heicToJpeg(input) },
  sanitizer: { sanitize: sanitizeRichText },
  pdf: reactPdfDocumentRenderer,
  directory: documentsDirectory,
  clock: () => new Date(),
};

export const documents = {};

export { documentsCatalog } from "./messages/catalog";
export { DOCUMENTS_EVENTS, type DocumentEventPayload } from "./domain/events";
