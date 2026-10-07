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
import { generateDocument, getIssueOptions, previewDocument } from "./application/generation";
import { markDocumentFileFailed, processDocumentFile } from "./application/maintenance";
import type { DocumentsDeps } from "./application/ports";
import { getStorageUsage } from "./application/quota";
import {
  createTemplate,
  getTemplate,
  listTemplates,
  setTemplateActive,
  updateTemplate,
} from "./application/templates";
import { confirmUpload, createUploadIntent } from "./application/uploads";
import { documentsDirectory } from "./infrastructure/directory";
import { reactPdfDocumentRenderer } from "./infrastructure/pdf-renderer";
import { documentStorage } from "./infrastructure/storage";

const baseDeps: DocumentsDeps = {
  storage: documentStorage,
  images: { heicToJpeg: (input) => sharedImageProcessor.heicToJpeg(input) },
  sanitizer: { sanitize: sanitizeRichText },
  pdf: reactPdfDocumentRenderer,
  directory: documentsDirectory,
  clock: () => new Date(),
};

// The use cases bound to their dependencies. `adjust` lets tests replace an adapter (a renderer that
// fails, a storage that records its writes) while the rest stays real.
export function createDocuments(adjust?: (base: DocumentsDeps) => DocumentsDeps) {
  const deps = adjust ? adjust(baseDeps) : baseDeps;
  return {
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
    // Templates and issuing documents
    listTemplates: (ctx: RequestContext, input?: unknown) => listTemplates(deps, ctx, input),
    getTemplate: (ctx: RequestContext, input: unknown) => getTemplate(ctx, input),
    createTemplate: (ctx: RequestContext, input: unknown) => createTemplate(deps, ctx, input),
    updateTemplate: (ctx: RequestContext, input: unknown) => updateTemplate(deps, ctx, input),
    setTemplateActive: (ctx: RequestContext, input: unknown) => setTemplateActive(ctx, input),
    getIssueOptions: (ctx: RequestContext, patientId: string) => getIssueOptions(deps, ctx, patientId),
    previewDocument: (ctx: RequestContext, input: unknown) => previewDocument(deps, ctx, input),
    generateDocument: (ctx: RequestContext, input: unknown) => generateDocument(deps, ctx, input),
    // Worker
    processDocumentFile: (input: { organizationId: string; documentId: string }) =>
      processDocumentFile(deps, input),
    markDocumentFileFailed: (input: { organizationId: string; documentId: string }) =>
      markDocumentFileFailed(deps, input),
  };
}

export const documents = createDocuments();

export { documentsCatalog } from "./messages/catalog";
export { DocumentsTab } from "./ui/documents-tab";
export { CategoriesPanel } from "./ui/categories-panel";
export { StorageUsagePanel } from "./ui/storage-usage";
export { TemplateEditor } from "./ui/template-editor";
export { TemplatesTable } from "./ui/templates-table";
export type { DocumentActions } from "./ui/document-actions";
export type { SettingsActions } from "./ui/settings-actions";
export { DOCUMENTS_EVENTS, type DocumentEventPayload } from "./domain/events";
export { MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD, QUOTA_GB } from "./domain/limits";
export type { CategoryItem } from "./application/categories";
export type { DocumentItem, DocumentPage } from "./application/documents";
export type { DocumentPreview, IssueOptions, MissingItem } from "./application/generation";
export type { DocumentPdfInput, DocumentsDeps } from "./application/ports";
export type { TemplateDetails, TemplateItem } from "./application/templates";
export type { StorageUsage } from "./application/quota";
export type { ConfirmedUpload, UploadIntentResult } from "./application/uploads";
