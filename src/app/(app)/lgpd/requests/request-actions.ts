import type { RequestActions } from "@/modules/privacy";
import {
  anonymizePatientAction,
  completeRequestAction,
  createRequestAction,
  downloadExportAction,
  previewAnonymizationAction,
  requestExportAction,
} from "./actions";

// The Server Actions the LGPD screens receive as props (the module's UI never imports `app/`).
export const requestActions = {
  create: createRequestAction,
  complete: completeRequestAction,
  requestExport: requestExportAction,
  download: downloadExportAction,
  preview: previewAnonymizationAction,
  anonymize: anonymizePatientAction,
} as unknown as RequestActions;
