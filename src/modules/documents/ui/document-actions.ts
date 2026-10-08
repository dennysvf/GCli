import type { ActionResult } from "@/shared/kernel/action-result";
import type { DocumentPage } from "../application/documents";
import type { DocumentPreview } from "../application/generation";
import type { StorageUsage } from "../application/quota";
import type { ConfirmedUpload } from "../application/uploads";

// The Server Actions the documents screens call. The route passes the real ones, so the module's UI
// never imports from `app/` (spec F08 section 4).
export type DocumentActions = {
  confirmUpload: (input: { uploadId: string }) => Promise<ActionResult<ConfirmedUpload>>;
  list: (input: {
    patientId: string;
    categoryId?: string;
    kind?: "UPLOADED" | "GENERATED";
    includeArchived?: boolean;
    cursor?: string;
  }) => Promise<ActionResult<DocumentPage>>;
  update: (input: {
    documentId: string;
    title: string;
    categoryId: string;
    version: number;
  }) => Promise<ActionResult<{ version: number; clinical: boolean }>>;
  archive: (input: {
    documentId: string;
    reason: string;
    version: number;
  }) => Promise<ActionResult<{ archivedAt: string; version: number }>>;
  restore: (input: { documentId: string; version: number }) => Promise<ActionResult<{ version: number }>>;
  usage: () => Promise<ActionResult<StorageUsage>>;
  // Issuing documents from templates (PRD F08 Full Scope).
  preview: (input: IssueInput) => Promise<ActionResult<DocumentPreview>>;
  generate: (
    input: IssueInput & { confirmMissing: boolean },
  ) => Promise<ActionResult<{ documentId: string; openUrl: string }>>;
};

export type IssueInput = {
  patientId: string;
  templateId: string;
  professionalId: string;
  unitId: string;
  fields: Record<string, string>;
};
