import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { formatDate, formatLocale } from "@/shared/i18n/format";
import { isLocale } from "@/shared/i18n/locales";
import { createTranslator } from "@/shared/i18n/translator";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { objectKey } from "@/shared/storage/object-storage";
import { PrivacyErrors } from "../domain/errors";
import { isDownloadable, isPastAvailability, LgpdExport, type ExportErrorCode } from "../domain/lgpd-export";
import { EXPORT_TIME_BUDGET_MS } from "../domain/limits";
import { archiveEntries, buildExportJson, buildExportPdfModel, exportFiles } from "./export-content";
import { ExportBuildError, type PrivacyDeps } from "./ports";
import { exportIdSchema, requestIdSchema } from "./schemas";
import { isUniqueViolation, shortRequestId, systemContext } from "./support";

// The LGPD data export (PRD F14 Full Scope, spec decisions D12–D15): the request commits an export
// row and an outbox message; the worker builds the ZIP; the file is downloadable for 7 days through
// a short-lived link. Generating it and every download are audited with the requester and the reason.

export type ExportsDeps = Pick<
  PrivacyDeps,
  "requests" | "exports" | "data" | "archive" | "pdf" | "directory" | "clock" | "newId"
>;

const CLEANUP_BATCH = 100;

export async function requestExport(
  deps: ExportsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ exportId: string; status: "PROCESSING" }>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(requestIdSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  try {
    return await withTransaction(ctx, async (uow) => {
      const request = await deps.requests.findById(uow, parsed.value.requestId, { lock: true });
      if (!request) return fail(PrivacyErrors.requestNotFound());
      const version = request.snapshot.version;
      const started = request.startExport();
      if (!started.ok) return started;
      const item = LgpdExport.start({
        id: deps.newId(),
        organizationId: ctx.organizationId,
        requestId: request.id,
        locale: ctx.locale,
        requestedById: ctx.user.id,
        now,
      });
      await deps.exports.insert(uow, item);
      if ((await deps.requests.save(uow, request, version)) === "STALE")
        return fail(CommonErrors.staleVersion());
      const props = request.snapshot;
      await uow.audit.record({
        action: "EXPORT",
        entityType: "lgpd_request",
        entityId: request.id,
        summary: "Exportação LGPD solicitada",
        metadata: {
          patientId: props.patientId,
          exportId: item.id,
          phase: "requested",
          requestedBy: props.requestedBy,
          reason: props.description,
        },
      });
      await uow.outbox.add("privacy.export-build", { organizationId: ctx.organizationId, exportId: item.id });
      return ok({ exportId: item.id, status: "PROCESSING" as const });
    });
  } catch (error) {
    // A double click while building: the partial unique index lets only one build exist.
    if (isUniqueViolation(error, "uq_lgpd_export_processing")) return fail(PrivacyErrors.exportInProgress());
    throw error;
  }
}

export async function getExportDownload(
  deps: ExportsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ url: string; fileName: string; expiresAt: string }>> {
  const allowed = await authorize(ctx, "lgpd:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(exportIdSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  const zone = await deps.directory.organizationTimeZone(ctx);
  return withTransaction(ctx, async (uow) => {
    const item = await deps.exports.findById(uow, parsed.value.exportId);
    if (!item) return fail(PrivacyErrors.exportNotFound());
    const props = item.snapshot;
    const request = await deps.requests.findById(uow, props.requestId);
    if (!request) return fail(PrivacyErrors.exportNotFound());
    if (isPastAvailability(props, now)) {
      const until = props.expiresAt ?? props.expiredAt ?? now;
      return fail(
        PrivacyErrors.exportExpired(
          formatDate(until, formatLocale(ctx.locale, ctx.organizationCountry), zone),
        ),
      );
    }
    if (!isDownloadable(props, now) || !props.objectKey || !props.expiresAt)
      return fail(PrivacyErrors.exportNotReady());
    const fileName = `dados-paciente-${shortRequestId(request.id)}.zip`;
    const url = await deps.archive.presignDownload(props.objectKey, fileName);
    const requestProps = request.snapshot;
    await uow.audit.record({
      action: "EXPORT",
      entityType: "lgpd_request",
      entityId: request.id,
      summary: "Exportação LGPD baixada",
      metadata: {
        patientId: requestProps.patientId,
        requestId: request.id,
        exportId: item.id,
        phase: "downloaded",
        requestedBy: requestProps.requestedBy,
        reason: requestProps.description,
      },
    });
    return ok({ url, fileName, expiresAt: props.expiresAt.toISOString() });
  });
}

export type BuildOutcome = { status: "READY" | "FAILED" | "SKIPPED"; errorCode?: ExportErrorCode };

async function markFailed(
  deps: ExportsDeps,
  organizationId: string,
  exportId: string,
  code: ExportErrorCode,
): Promise<BuildOutcome> {
  const ctx = systemContext(organizationId);
  const now = deps.clock();
  const done = await withTransaction(ctx, async (uow) => {
    const item = await deps.exports.findById(uow, exportId, { lock: true });
    if (!item || !item.markFailed(code, now)) return ok(false);
    await deps.exports.save(uow, item);
    const request = await deps.requests.findById(uow, item.snapshot.requestId, { lock: true });
    if (request) {
      const version = request.snapshot.version;
      request.exportFailed();
      await deps.requests.save(uow, request, version);
    }
    await uow.audit.record({
      action: "UPDATE",
      entityType: "lgpd_export",
      entityId: item.id,
      summary: "Falha na geração da exportação LGPD",
      changes: { status: { before: "PROCESSING", after: "FAILED" } },
      metadata: {
        patientId: request?.snapshot.patientId ?? null,
        requestId: item.snapshot.requestId,
        errorCode: code,
      },
    });
    return ok(true);
  });
  return done.ok && done.value ? { status: "FAILED", errorCode: code } : { status: "SKIPPED" };
}

// The worker job (spec decisions D13, D14). It never throws, so the queue never retries it: any
// failure aborts the upload, marks the export and the request failed, and the user decides.
export async function buildExport(
  deps: ExportsDeps,
  input: { organizationId: string; exportId: string },
): Promise<BuildOutcome> {
  const { organizationId, exportId } = input;
  const ctx = systemContext(organizationId);
  const started = deps.clock();
  try {
    const loaded = await withTransaction(ctx, async (uow) => {
      const item = await deps.exports.findById(uow, exportId);
      if (!item || !item.isProcessing()) return ok(null);
      const request = await deps.requests.findById(uow, item.snapshot.requestId);
      if (!request) return ok(null);
      const data = await deps.data.read(uow, organizationId, request.snapshot.patientId);
      return ok({ item, request, data });
    });
    if (!loaded.ok || !loaded.value) return { status: "SKIPPED" };
    const { item, request, data } = loaded.value;
    if (!data) return markFailed(deps, organizationId, exportId, "RENDER_ERROR");

    const props = item.snapshot;
    const locale = isLocale(props.locale) ? props.locale : "pt-BR";
    const t = createTranslator(locale);
    const requestInfo = {
      id: request.id,
      requestedBy: request.snapshot.requestedBy,
      reason: request.snapshot.description,
    };
    const files = exportFiles(data);
    let pdf: Uint8Array;
    let json: unknown;
    try {
      const logo = data.organization.logoKey
        ? await deps.data.organizationLogo(data.organization.logoKey)
        : null;
      json = buildExportJson({ data, request: requestInfo, locale, generatedAt: started, t });
      pdf = await deps.pdf.render(
        buildExportPdfModel({ data, request: requestInfo, locale, generatedAt: started, t, logo }),
      );
    } catch {
      return markFailed(deps, organizationId, exportId, "RENDER_ERROR");
    }

    // PRD F14: at most 5 minutes; past the budget the upload is aborted and the export fails.
    const budget = new AbortController();
    const timer = setTimeout(
      () => budget.abort(),
      Math.max(0, EXPORT_TIME_BUDGET_MS - (deps.clock().getTime() - started.getTime())),
    );
    const key = objectKey(organizationId, "privacy", `${deps.newId()}.zip`);
    let sizeBytes: number;
    try {
      ({ sizeBytes } = await deps.archive.write(key, archiveEntries({ json, pdf, files }), {
        signal: budget.signal,
      }));
    } catch (error) {
      const code = error instanceof ExportBuildError ? error.code : "STORAGE_ERROR";
      return markFailed(deps, organizationId, exportId, code);
    } finally {
      clearTimeout(timer);
    }

    const now = deps.clock();
    const done = await withTransaction(ctx, async (uow) => {
      const locked = await deps.exports.findById(uow, exportId, { lock: true });
      if (!locked || !locked.markReady({ objectKey: key, sizeBytes, fileCount: files.length, now }))
        return ok(false);
      await deps.exports.save(uow, locked);
      const lockedRequest = await deps.requests.findById(uow, request.id, { lock: true });
      if (lockedRequest) {
        const version = lockedRequest.snapshot.version;
        lockedRequest.exportSucceeded(now);
        await deps.requests.save(uow, lockedRequest, version);
      }
      // Opening the ZIP happens outside the application, so the clinical content it carries is
      // audited here, at generation (spec decision D21, ADR-040).
      await uow.audit.record({
        action: "EXPORT",
        entityType: "lgpd_request",
        entityId: request.id,
        summary: "Exportação LGPD gerada",
        metadata: {
          patientId: request.snapshot.patientId,
          exportId,
          phase: "generated",
          fileCount: files.length,
          noteIds: data.clinicalNotes.map((note) => note.id),
          attachmentIds: data.clinicalNotes.flatMap((note) =>
            note.attachments.map((attachment) => attachment.id),
          ),
          durationMs: now.getTime() - started.getTime(),
        },
      });
      return ok(true);
    });
    if (!done.ok || !done.value) {
      // The export changed state meanwhile: the finished file is not offered.
      await deps.archive.delete(key).catch(() => undefined);
      return { status: "SKIPPED" };
    }
    return { status: "READY" };
  } catch {
    return markFailed(deps, organizationId, exportId, "STORAGE_ERROR").catch((): BuildOutcome => ({
      status: "FAILED",
      errorCode: "STORAGE_ERROR",
    }));
  }
}

// The file of an export that was expired (by anonymization or by the daily job). Idempotent.
export async function deleteExportFile(deps: ExportsDeps, input: { objectKey: string }): Promise<void> {
  await deps.archive.delete(input.objectKey);
}

// PRD F14: files are kept for 7 days. The daily job deletes the file first and then marks the export
// expired, so a failure in between is retried by the next run instead of leaving a file behind.
export async function cleanupExpiredExports(
  deps: ExportsDeps,
  input: { organizationId: string; now?: Date },
): Promise<{ expired: number }> {
  const now = input.now ?? deps.clock();
  const ctx = systemContext(input.organizationId);
  const due = await withTransaction(ctx, async (uow) =>
    ok(await deps.exports.readyExpiredBefore(uow, now, CLEANUP_BATCH)),
  );
  if (!due.ok) return { expired: 0 };
  let expired = 0;
  for (const candidate of due.value) {
    const key = candidate.snapshot.objectKey;
    if (!key) continue;
    await deps.archive.delete(key);
    const done = await withTransaction(ctx, async (uow) => {
      const item = await deps.exports.findById(uow, candidate.id, { lock: true });
      if (!item || !isPastAvailability(item.snapshot, now) || !item.expire(now)) return ok(false);
      await deps.exports.save(uow, item);
      const request = await deps.requests.findById(uow, item.snapshot.requestId);
      await uow.audit.record({
        action: "UPDATE",
        entityType: "lgpd_export",
        entityId: item.id,
        summary: "Exportação LGPD expirada e arquivo apagado",
        changes: { status: { before: "READY", after: "EXPIRED" } },
        metadata: { patientId: request?.snapshot.patientId ?? null, requestId: item.snapshot.requestId },
      });
      return ok(true);
    });
    if (done.ok && done.value) expired += 1;
  }
  return { expired };
}
