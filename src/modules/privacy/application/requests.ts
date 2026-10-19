import { diffChanges } from "@/shared/audit/diff";
import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { addDays } from "@/shared/kernel/calendar-date";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { parseInput } from "@/shared/kernel/validation";
import { zonedTimeToUtc } from "@/shared/kernel/zoned-time";
import { PrivacyErrors } from "../domain/errors";
import {
  isPastAvailability,
  isDownloadable,
  type ExportErrorCode,
  type ExportStatus,
  type LgpdExport,
} from "../domain/lgpd-export";
import {
  daysOpen,
  isOverdue,
  LgpdRequest,
  type RequesterKind,
  type RequestStatus,
  type RequestType,
} from "../domain/lgpd-request";
import { LGPD_OVERDUE_DAYS, REQUESTS_PAGE_SIZE } from "../domain/limits";
import type { PrivacyDeps } from "./ports";
import { completeRequestSchema, createRequestSchema, listRequestsSchema, requestIdSchema } from "./schemas";
import { isUniqueViolation } from "./support";

// The LGPD request register (PRD F14 Capabilities, spec decisions D10 and D11): Administrators only
// (lgpd:manage); every change is audited with the patient id in its metadata.

export type RequestsDeps = Pick<
  PrivacyDeps,
  "requests" | "exports" | "patients" | "directory" | "clock" | "newId"
>;

export type RequestListItem = {
  id: string;
  createdAt: string;
  patientId: string;
  patientDisplayName: string;
  type: RequestType;
  requestedBy: RequesterKind;
  status: RequestStatus;
  completedAt: string | null;
  daysOpen: number;
  overdue: boolean;
};

export type RequestList = {
  items: RequestListItem[];
  page: number;
  pageSize: number;
  total: number;
  openOverdueCount: number;
  organizationTimeZone: string;
};

export async function listRequests(
  deps: RequestsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<RequestList>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(listRequestsSchema, input ?? {});
  if (!parsed.ok) return parsed;
  const { status, type, page } = parsed.value;
  const zone = await deps.directory.organizationTimeZone(ctx);
  const today = dateInTimeZone(deps.clock(), zone);
  // Overdue means open for more than 15 calendar days in the organization's zone.
  const overdueBefore = zonedTimeToUtc(`${addDays(today, -LGPD_OVERDUE_DAYS)}T00:00`, zone);
  const loaded = await withTransaction(ctx, async (uow) =>
    ok({
      list: await deps.requests.list(uow, {
        organizationId: ctx.organizationId,
        status,
        type,
        page,
        pageSize: REQUESTS_PAGE_SIZE,
      }),
      overdue: await deps.requests.countOpenCreatedBefore(uow, overdueBefore),
    }),
  );
  if (!loaded.ok) return loaded;
  return ok({
    items: loaded.value.list.rows.map(({ request, patientDisplayName }) => {
      const props = request.snapshot;
      const createdOn = dateInTimeZone(props.createdAt, zone);
      return {
        id: props.id,
        createdAt: props.createdAt.toISOString(),
        patientId: props.patientId,
        patientDisplayName,
        type: props.type,
        requestedBy: props.requestedBy,
        status: props.status,
        completedAt: props.completedAt?.toISOString() ?? null,
        daysOpen: daysOpen(createdOn, today),
        overdue: isOverdue(props.status, createdOn, today),
      };
    }),
    page,
    pageSize: REQUESTS_PAGE_SIZE,
    total: loaded.value.list.total,
    openOverdueCount: loaded.value.overdue,
    organizationTimeZone: zone,
  });
}

export type ExportView = {
  id: string;
  // EXPIRED also when a ready export is past its 7 days and the daily job has not run yet.
  status: ExportStatus;
  requestedAt: string;
  requestedByName: string;
  readyAt: string | null;
  expiresAt: string | null;
  failedAt: string | null;
  expiredAt: string | null;
  errorCode: ExportErrorCode | null;
  sizeBytes: number | null;
  fileCount: number | null;
  downloadable: boolean;
};

export type RequestHistoryEvent =
  | "CREATED"
  | "EXPORT_REQUESTED"
  | "EXPORT_READY"
  | "EXPORT_FAILED"
  | "EXPORT_EXPIRED"
  | "COMPLETED"
  | "LEGAL_RETENTION";

export type RequestDetail = {
  id: string;
  type: RequestType;
  requestedBy: RequesterKind;
  description: string;
  status: RequestStatus;
  resolution: string | null;
  createdAt: string;
  createdByName: string;
  completedAt: string | null;
  completedByName: string | null;
  version: number;
  daysOpen: number;
  overdue: boolean;
  patient: { id: string; displayName: string; anonymized: boolean };
  exports: ExportView[];
  // Newest last; "by" is null for the system (the worker).
  history: { at: string; event: RequestHistoryEvent; byName: string | null }[];
  actions: {
    export: "GENERATE" | "RETRY" | "AGAIN" | null;
    complete: boolean;
    anonymize: boolean;
  };
  organizationTimeZone: string;
};

function exportView(item: LgpdExport, now: Date, names: Map<string, string>): ExportView {
  const props = item.snapshot;
  const expired = isPastAvailability(props, now);
  return {
    id: props.id,
    status: expired ? "EXPIRED" : props.status,
    requestedAt: props.requestedAt.toISOString(),
    requestedByName: names.get(props.requestedById) ?? "",
    readyAt: props.readyAt?.toISOString() ?? null,
    expiresAt: props.expiresAt?.toISOString() ?? null,
    failedAt: props.failedAt?.toISOString() ?? null,
    expiredAt: (props.expiredAt ?? (expired ? props.expiresAt : null))?.toISOString() ?? null,
    errorCode: props.errorCode,
    sizeBytes: props.sizeBytes,
    fileCount: props.fileCount,
    downloadable: isDownloadable(props, now),
  };
}

function exportAction(request: LgpdRequest, exports: ExportView[]): RequestDetail["actions"]["export"] {
  const props = request.snapshot;
  if (props.type !== "ACCESS") return null;
  const latest = exports[0];
  if (props.status === "PROCESSING" || latest?.status === "PROCESSING") return null;
  if (!latest) return "GENERATE";
  if (latest.status === "FAILED") return "RETRY";
  return "AGAIN";
}

function historyOf(
  request: LgpdRequest,
  exports: ExportView[],
  names: Map<string, string>,
): RequestDetail["history"] {
  const props = request.snapshot;
  const events: RequestDetail["history"] = [
    { at: props.createdAt.toISOString(), event: "CREATED", byName: names.get(props.createdById) ?? "" },
  ];
  for (const item of exports) {
    events.push({ at: item.requestedAt, event: "EXPORT_REQUESTED", byName: item.requestedByName });
    if (item.readyAt) events.push({ at: item.readyAt, event: "EXPORT_READY", byName: null });
    if (item.failedAt) events.push({ at: item.failedAt, event: "EXPORT_FAILED", byName: null });
    if (item.expiredAt) events.push({ at: item.expiredAt, event: "EXPORT_EXPIRED", byName: null });
  }
  if (props.completedAt && (props.status === "COMPLETED" || props.status === "LEGAL_RETENTION")) {
    events.push({
      at: props.completedAt.toISOString(),
      event: props.status,
      byName: props.completedById ? (names.get(props.completedById) ?? "") : null,
    });
  }
  return events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

export async function getRequest(
  deps: RequestsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<RequestDetail>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(requestIdSchema, input);
  if (!parsed.ok) return parsed;
  const loaded = await withTransaction(ctx, async (uow) => {
    const request = await deps.requests.findById(uow, parsed.value.requestId);
    if (!request) return fail(PrivacyErrors.requestNotFound());
    return ok({ request, exports: await deps.exports.listForRequest(uow, request.id) });
  });
  if (!loaded.ok) return loaded;
  const { request, exports } = loaded.value;
  const props = request.snapshot;
  const patient = await deps.patients.patient(ctx, props.patientId);
  if (!patient.ok) return patient;
  const names = await deps.directory.userNames(ctx, [
    props.createdById,
    ...(props.completedById ? [props.completedById] : []),
    ...exports.map((item) => item.snapshot.requestedById),
  ]);
  const zone = await deps.directory.organizationTimeZone(ctx);
  const now = deps.clock();
  const today = dateInTimeZone(now, zone);
  const createdOn = dateInTimeZone(props.createdAt, zone);
  const views = exports.map((item) => exportView(item, now, names));
  return ok({
    id: props.id,
    type: props.type,
    requestedBy: props.requestedBy,
    description: props.description,
    status: props.status,
    resolution: props.resolution,
    createdAt: props.createdAt.toISOString(),
    createdByName: names.get(props.createdById) ?? "",
    completedAt: props.completedAt?.toISOString() ?? null,
    completedByName: props.completedById ? (names.get(props.completedById) ?? "") : null,
    version: props.version,
    daysOpen: daysOpen(createdOn, today),
    overdue: isOverdue(props.status, createdOn, today),
    patient: {
      id: patient.value.id,
      displayName: patient.value.displayName,
      anonymized: patient.value.anonymized,
    },
    exports: views,
    history: historyOf(request, views, names),
    actions: {
      export: exportAction(request, views),
      complete: props.type === "CORRECTION" && request.isOpen(),
      anonymize: props.type === "ANONYMIZATION" && request.isOpen() && !patient.value.anonymized,
    },
    organizationTimeZone: zone,
  });
}

export async function createRequest(
  deps: RequestsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ requestId: string; status: RequestStatus }>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createRequestSchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, type, requestedBy, description } = parsed.value;
  const patient = await deps.patients.patient(ctx, patientId);
  if (!patient.ok) return patient;
  if (type === "ANONYMIZATION" && patient.value.anonymized) return fail(PrivacyErrors.patientAnonymized());
  const request = LgpdRequest.register({
    id: deps.newId(),
    organizationId: ctx.organizationId,
    patientId,
    type,
    requestedBy,
    description,
    createdById: ctx.user.id,
    now: deps.clock(),
  });
  try {
    return await withTransaction(ctx, async (uow) => {
      // Spec assumption 4: one open anonymization request per patient (also a partial unique index).
      if (type === "ANONYMIZATION" && (await deps.requests.hasOpenAnonymization(uow, patientId))) {
        return fail(PrivacyErrors.anonymizationRequestOpen());
      }
      await deps.requests.insert(uow, request);
      await uow.audit.record({
        action: "CREATE",
        entityType: "lgpd_request",
        entityId: request.id,
        summary: "Solicitação LGPD registrada",
        changes: diffChanges(null, { type, requestedBy, status: "PENDING" }),
        metadata: { patientId, type, requestedBy, descriptionLength: request.snapshot.description.length },
      });
      return ok({ requestId: request.id, status: request.snapshot.status });
    });
  } catch (error) {
    if (isUniqueViolation(error, "uq_lgpd_request_open_anonymization")) {
      return fail(PrivacyErrors.anonymizationRequestOpen());
    }
    throw error;
  }
}

// "Concluir solicitação" of a correction request: the correction itself was made in the F05 form,
// which already audits it; the register keeps the date and what was done.
export async function completeRequest(
  deps: RequestsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ status: RequestStatus; completedAt: string }>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(completeRequestSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    const request = await deps.requests.findById(uow, parsed.value.requestId, { lock: true });
    if (!request) return fail(PrivacyErrors.requestNotFound());
    const version = request.snapshot.version;
    const before = request.snapshot.status;
    const completed = request.complete({ resolution: parsed.value.resolution, userId: ctx.user.id, now });
    if (!completed.ok) return completed;
    if ((await deps.requests.save(uow, request, version)) === "STALE")
      return fail(CommonErrors.staleVersion());
    await uow.audit.record({
      action: "UPDATE",
      entityType: "lgpd_request",
      entityId: request.id,
      summary: "Solicitação LGPD concluída",
      changes: {
        status: { before, after: "COMPLETED" },
        completedAt: { before: null, after: now.toISOString() },
      },
      metadata: {
        patientId: request.snapshot.patientId,
        resolutionLength: request.snapshot.resolution?.length ?? 0,
      },
    });
    return ok({ status: request.snapshot.status, completedAt: now.toISOString() });
  });
}
