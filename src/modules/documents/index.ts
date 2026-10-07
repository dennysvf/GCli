// Public API of the documents module (spec F08 section 5). Use cases are wired here with their
// infrastructure adapters; callers never import files inside the module.
import type { RequestContext } from "@/shared/context/types";
import { sanitizeRichText } from "@/shared/rich-text/sanitizer";
import { sharedImageProcessor } from "@/shared/storage/image-processor";
import { createCategory, listCategories, setCategoryActive, updateCategory } from "./application/categories";
import {
  archiveDocument,
  listPatientDocuments,
  openDocument,
  restoreDocument,
  updateDocument,
} from "./application/documents";
import { markDocumentFileFailed, processDocumentFile } from "./application/maintenance";
import type { DocumentsDeps } from "./application/ports";
import { getStorageUsage } from "./application/quota";
import { confirmUpload, createUploadIntent } from "./application/uploads";
import { documentsDirectory } from "./infrastructure/directory";
import { reactPdfDocumentRenderer } from "./infrastructure/pdf-renderer";
import { documentStorage } from "./infrastructure/storage";

const deps: DocumentsDeps = {
  storage: documentStorage,
  images: { heicToJpeg: (input) => sharedImageProcessor.heicToJpeg(input) },
  sanitizer: { sanitize: sanitizeRichText },
  pdf: reactPdfDocumentRenderer,
  directory: documentsDirectory,
  clock: () => new Date(),
};

export const documents = {
  // Reads
  listPatientDocuments: (ctx: RequestContext, input: unknown) => listPatientDocuments(deps, ctx, input),
  openDocument: (ctx: RequestContext, input: unknown) => openDocument(deps, ctx, input),
  getStorageUsage: (ctx: RequestContext) => getStorageUsage(ctx),
  listCategories: (ctx: RequestContext, input?: unknown) => listCategories(ctx, input),
  // Uploads and corrections
  createUploadIntent: (ctx: RequestContext, input: unknown) => createUploadIntent(deps, ctx, input),
  confirmUpload: (ctx: RequestContext, input: unknown) => confirmUpload(deps, ctx, input),
  updateDocument: (ctx: RequestContext, input: unknown) => updateDocument(deps, ctx, input),
  archiveDocument: (ctx: RequestContext, input: unknown) => archiveDocument(deps, ctx, input),
  restoreDocument: (ctx: RequestContext, input: unknown) => restoreDocument(deps, ctx, input),
  // Categories
  createCategory: (ctx: RequestContext, input: unknown) => createCategory(ctx, input),
  updateCategory: (ctx: RequestContext, input: unknown) => updateCategory(ctx, input),
  setCategoryActive: (ctx: RequestContext, input: unknown) => setCategoryActive(ctx, input),
  // Worker
  processDocumentFile: (input: { organizationId: string; documentId: string }) =>
    processDocumentFile(deps, input),
  markDocumentFileFailed: (input: { organizationId: string; documentId: string }) =>
    markDocumentFileFailed(deps, input),
};

export { documentsCatalog } from "./messages/catalog";
export { DocumentsTab } from "./ui/documents-tab";
export type { DocumentActions } from "./ui/document-actions";
export { DOCUMENTS_EVENTS, type DocumentEventPayload } from "./domain/events";
export { MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD, QUOTA_GB } from "./domain/limits";
export type { CategoryItem } from "./application/categories";
export type { DocumentItem, DocumentPage } from "./application/documents";
export type { StorageUsage } from "./application/quota";
export type { ConfirmedUpload, UploadIntentResult } from "./application/uploads";
