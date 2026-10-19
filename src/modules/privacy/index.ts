// Public API of the privacy module (spec F14 section 5): the patient timeline, the LGPD request
// register, the data export and the anonymization. Use cases are wired here with their
// infrastructure adapters; callers never import files inside the module.
import { randomInt } from "node:crypto";
import type { RequestContext } from "@/shared/context/types";
import { newId } from "@/shared/kernel/ids";
import {
  buildExport,
  cleanupExpiredExports,
  deleteExportFile,
  getExportDownload,
  requestExport,
  type ExportsDeps,
} from "./application/exports";
import { anonymizePatient, previewAnonymization } from "./application/anonymization";
import type { PrivacyDeps } from "./application/ports";
import {
  completeRequest,
  createRequest,
  getRequest,
  listRequests,
  type RequestsDeps,
} from "./application/requests";
import { getPatientTimeline, getTimelineNote, type TimelineDeps } from "./application/timeline";
import { anonymizationSteps, clinicalGate, patientGate, privacyDirectory } from "./infrastructure/directory";
import { reactPdfExportSummary } from "./infrastructure/export-pdf";
import { prismaExportRepository } from "./infrastructure/prisma-export-repository";
import { prismaRequestRepository } from "./infrastructure/prisma-request-repository";
import { sqlPatientDataReader } from "./infrastructure/sql-patient-data-reader";
import { sqlTimelineReader } from "./infrastructure/sql-timeline-reader";
import { zipExportArchive } from "./infrastructure/zip-archive";

type Deps = PrivacyDeps & TimelineDeps & RequestsDeps & ExportsDeps;

// A cryptographic source in [0, 1) for the anonymization code.
const RANDOM_RANGE = 2 ** 32;
const cryptoRandom = () => randomInt(RANDOM_RANGE) / RANDOM_RANGE;

const baseDeps: Deps = {
  timeline: sqlTimelineReader,
  requests: prismaRequestRepository,
  exports: prismaExportRepository,
  data: sqlPatientDataReader,
  archive: zipExportArchive,
  pdf: reactPdfExportSummary,
  patients: patientGate,
  clinical: clinicalGate,
  steps: anonymizationSteps,
  directory: privacyDirectory,
  clock: () => new Date(),
  random: cryptoRandom,
  newId,
};

// The use cases bound to their dependencies. `adjust` lets tests replace an adapter (a clock, the
// storage, the PDF renderer) while the rest stays real.
export function createPrivacy(adjust?: (base: Deps) => Deps) {
  const deps = adjust ? adjust(baseDeps) : baseDeps;
  return {
    // Timeline
    getPatientTimeline: (ctx: RequestContext, input: unknown) => getPatientTimeline(deps, ctx, input),
    getTimelineNote: (ctx: RequestContext, input: unknown) => getTimelineNote(deps, ctx, input),
    // Request register
    listRequests: (ctx: RequestContext, input: unknown) => listRequests(deps, ctx, input),
    getRequest: (ctx: RequestContext, requestId: string) => getRequest(deps, ctx, { requestId }),
    createRequest: (ctx: RequestContext, input: unknown) => createRequest(deps, ctx, input),
    completeRequest: (ctx: RequestContext, input: unknown) => completeRequest(deps, ctx, input),
    // Export
    requestExport: (ctx: RequestContext, input: unknown) => requestExport(deps, ctx, input),
    getExportDownload: (ctx: RequestContext, input: unknown) => getExportDownload(deps, ctx, input),
    // Anonymization
    previewAnonymization: (ctx: RequestContext, input: unknown) => previewAnonymization(deps, ctx, input),
    anonymizePatient: (ctx: RequestContext, input: unknown) => anonymizePatient(deps, ctx, input),
    // Worker
    buildExport: (input: { organizationId: string; exportId: string }) => buildExport(deps, input),
    deleteExportFile: (input: { objectKey: string }) => deleteExportFile(deps, input),
    cleanupExpiredExports: (input: { organizationId: string; now?: Date }) =>
      cleanupExpiredExports(deps, input),
  };
}

export const privacy = createPrivacy();

export { privacyCatalog } from "./messages/catalog";
export {
  EXPORT_AVAILABILITY_DAYS,
  EXPORT_FILE_TARGET,
  EXPORT_TIME_BUDGET_MS,
  LGPD_OVERDUE_DAYS,
  TIMELINE_PAGE_SIZE,
  TIMELINE_P95_MS,
} from "./domain/limits";
export {
  TIMELINE_GROUPS,
  TIMELINE_KINDS,
  type TimelineGroup,
  type TimelineKind,
} from "./domain/timeline-event";
export { REQUEST_STATUSES, REQUEST_TYPES, REQUESTER_KINDS } from "./domain/lgpd-request";
export type { RequestStatus, RequestType, RequesterKind } from "./domain/lgpd-request";
export type { ExportArchive, ExportPdf, PrivacyDeps, TimelineItem } from "./application/ports";
export type { TimelineNote, TimelinePage } from "./application/timeline";
export type { ExportView, RequestDetail, RequestList, RequestListItem } from "./application/requests";
export type { BuildOutcome } from "./application/exports";
export type { AnonymizationPreview, AnonymizationResult } from "./application/anonymization";
export type { AnonymizationFacts, AnonymizationOutcome } from "./domain/eligibility";
export { PatientTimeline } from "./ui/patient-timeline";
export { RequestsView } from "./ui/requests-view";
export { RequestDetailView } from "./ui/request-detail";
export type { TimelineActions } from "./ui/timeline-actions";
export type { RequestActions } from "./ui/request-actions";
