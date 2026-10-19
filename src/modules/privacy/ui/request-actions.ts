import type { ActionResult } from "@/shared/kernel/action-result";
import type { AnonymizationPreview, AnonymizationResult } from "../application/anonymization";
import type { RequestStatus } from "../domain/lgpd-request";

// The Server Actions the LGPD screens call. The routes pass the real ones, so the module's UI never
// imports from `app/` (spec F14 section 4).
export type RequestActions = {
  create: (input: {
    patientId: string;
    type: string;
    requestedBy: string;
    description: string;
  }) => Promise<ActionResult<{ requestId: string; status: RequestStatus }>>;
  complete: (input: {
    requestId: string;
    resolution: string;
  }) => Promise<ActionResult<{ status: RequestStatus; completedAt: string }>>;
  requestExport: (input: {
    requestId: string;
  }) => Promise<ActionResult<{ exportId: string; status: "PROCESSING" }>>;
  download: (input: {
    exportId: string;
  }) => Promise<ActionResult<{ url: string; fileName: string; expiresAt: string }>>;
  preview: (input: { requestId: string }) => Promise<ActionResult<AnonymizationPreview>>;
  anonymize: (input: {
    requestId: string;
    typedName: string;
    version: number;
  }) => Promise<ActionResult<AnonymizationResult>>;
};
