import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrivacy, type PrivacyDeps } from "@/modules/privacy";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { objectStorage } from "@/shared/storage/object-storage";
import { cleanupExpiredExportsJob } from "@/worker/jobs/privacy";
import { readZipEntries, readZipFile } from "../../zip-reader";
import { closeHelpers, createOrganization, resetDatabase } from "../helpers";
import { schedulingWorld } from "../scheduling/support";
import {
  exportOf,
  objectsUnder,
  privacy,
  privacyWorld,
  requestOrThrow,
  seedExportPatient,
  storeObject,
  zipOf,
  type ExportPatient,
  type PrivacyWorld,
} from "./support";

let world: PrivacyWorld;
let bruna: ExportPatient;

const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  await resetDatabase();
  world = await privacyWorld();
  bruna = await seedExportPatient(world);
});
afterAll(closeHelpers);

type ExportJson = {
  patient: { fullName: string; document: { number: string } | null; email: string | null };
  consents: { id: string; file: string | null }[];
  appointments: { id: string }[];
  clinicalNotes: { id: string; contentText: string; attachments: { id: string; file: string | null }[] }[];
  documents: { id: string; title: string; file: string | null }[];
  charges: { id: string; payments: { id: string; amountMinor: string }[] }[];
  files: { path: string }[];
};

describe("LGPD data export", () => {
  it("F14: an export ZIP holds the JSON, the PDF summary and every file of the patient", async () => {
    const requestId = await requestOrThrow(world.admin, { patientId: bruna.patientId, type: "ACCESS" });
    const outbox = await db().outboxMessage.count({ where: { type: "privacy.export-build" } });
    const { outcome, row } = await exportOf(world, requestId);
    expect(await db().outboxMessage.count({ where: { type: "privacy.export-build" } })).toBe(outbox + 1);
    expect(outcome.status).toBe("READY");
    expect(row.status).toBe("READY");
    expect(row.objectKey).toMatch(new RegExp(`^org/${world.organizationId}/privacy/[0-9a-f-]+\\.zip$`));
    expect(row.fileCount).toBe(5);
    expect(row.expiresAt?.getTime()).toBe((row.readyAt?.getTime() ?? 0) + 7 * DAY);
    const zip = await zipOf(row.objectKey ?? "");
    expect(Number(row.sizeBytes)).toBe(zip.length);
    const names = readZipEntries(zip).map((entry) => entry.name);
    expect(names.slice(0, 2)).toEqual(["dados.json", "resumo.pdf"]);
    const files = names.filter((name) => name.startsWith("arquivos/"));
    expect(files).toHaveLength(5);
    expect(files.filter((name) => name.startsWith("arquivos/documentos/"))).toHaveLength(3);
    expect(files.filter((name) => name.startsWith("arquivos/anexos-clinicos/"))).toHaveLength(1);
    expect(files.filter((name) => name.startsWith("arquivos/consentimentos/"))).toHaveLength(1);
    expect(readZipFile(zip, "resumo.pdf").subarray(0, 4).toString()).toBe("%PDF");
    const request = await db().lgpdRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("COMPLETED");
    expect(request.completedAt).not.toBeNull();
  });

  it("F14: the JSON contains the patient's data from F05, F06, F07, F08 and F09", async () => {
    const requestId = await requestOrThrow(world.admin, { patientId: bruna.patientId, type: "ACCESS" });
    const { row } = await exportOf(world, requestId);
    const zip = await zipOf(row.objectKey ?? "");
    const json = JSON.parse(readZipFile(zip, "dados.json").toString("utf8")) as ExportJson;
    expect(json.patient).toMatchObject({
      fullName: "Bruna Teixeira",
      email: "bruna.teixeira@exemplo.com.br",
    });
    expect(json.patient.document?.number).toBe("52998224725");
    expect(json.consents.map((consent) => consent.id)).toEqual([bruna.consentId]);
    expect(json.appointments.map((appointment) => appointment.id).sort()).toEqual(
      [...bruna.appointmentIds].sort(),
    );
    expect(json.clinicalNotes[0]?.contentText).toContain("Paciente relata melhora após a sessão.");
    expect(json.clinicalNotes[0]?.attachments[0]?.id).toBe(bruna.attachmentId);
    expect(json.documents.map((document) => document.title).sort()).toEqual(
      ["Atestado", "Exame de sangue", "RG digitalizado"].sort(),
    );
    expect(json.charges[0]?.payments[0]).toMatchObject({ id: bruna.paymentId, amountMinor: "15000" });
    // Every listed file is in the ZIP with the content that was stored.
    const names = readZipEntries(zip).map((entry) => entry.name);
    for (const file of json.files) expect(names).toContain(file.path);
    const consentFile = json.consents[0]?.file ?? "";
    expect(readZipFile(zip, consentFile).toString()).toBe("%PDF-1.4 termo assinado");
  });

  it("F14: the PDF summary is in the requesting user's language", async () => {
    const models: Parameters<PrivacyDeps["pdf"]["render"]>[0][] = [];
    const recording = createPrivacy((base) => ({
      ...base,
      pdf: {
        render: async (model) => {
          models.push(model);
          return base.pdf.render(model);
        },
      },
    }));
    const requestId = await requestOrThrow(world.admin, { patientId: bruna.patientId, type: "ACCESS" });
    const english = { ...world.admin, locale: "en" as const };
    const requested = await recording.requestExport(english, { requestId });
    if (!requested.ok) throw new Error(requested.error.code);
    const row = await db().lgpdExport.findUniqueOrThrow({ where: { id: requested.value.exportId } });
    expect(row.locale).toBe("en");
    await recording.buildExport({ organizationId: world.organizationId, exportId: requested.value.exportId });
    expect(models[0]?.title).toBe("Summary of the patient's data");
    expect(models[0]?.sections[0]?.title).toBe("Patient");
  });

  it("F14: a ready export is available for 7 days and refused afterwards", async () => {
    const requestId = await requestOrThrow(world.admin, { patientId: bruna.patientId, type: "ACCESS" });
    const { exportId, row } = await exportOf(world, requestId);
    const now = await privacy.getExportDownload(world.admin, { exportId });
    expect(now.ok && now.value.fileName).toMatch(/^dados-paciente-[0-9a-f]{6}\.zip$/);
    expect(now.ok && now.value.url).toContain(row.objectKey ?? "missing");
    const ready = row.readyAt?.getTime() ?? 0;
    const later = createPrivacy((base) => ({ ...base, clock: () => new Date(ready + 7 * DAY - 60_000) }));
    expect((await later.getExportDownload(world.admin, { exportId })).ok).toBe(true);
    const expired = createPrivacy((base) => ({ ...base, clock: () => new Date(ready + 7 * DAY) }));
    const refused = await expired.getExportDownload(world.admin, { exportId });
    expect(!refused.ok && refused.error.code).toBe("PRIVACY_EXPORT_EXPIRED");
  });

  it("F14: the cleanup job deletes expired files and marks the export expired", async () => {
    const requestId = await requestOrThrow(world.admin, { patientId: bruna.patientId, type: "ACCESS" });
    const oldOne = await exportOf(world, requestId);
    const fresh = await exportOf(world, requestId);
    // The first export was ready 8 days ago: its availability ended yesterday.
    const readyAt = new Date(Date.now() - 8 * DAY);
    await db().lgpdExport.update({
      where: { id: oldOne.exportId },
      data: { readyAt, expiresAt: new Date(readyAt.getTime() + 7 * DAY) },
    });
    const removed = await cleanupExpiredExportsJob();
    expect(removed).toBeGreaterThanOrEqual(1);
    const expiredRow = await db().lgpdExport.findUniqueOrThrow({ where: { id: oldOne.exportId } });
    expect(expiredRow).toMatchObject({ status: "EXPIRED", objectKey: null });
    expect(expiredRow.expiredAt).not.toBeNull();
    expect(await objectStorage().head(oldOne.row.objectKey ?? "")).toBeNull();
    const freshRow = await db().lgpdExport.findUniqueOrThrow({ where: { id: fresh.exportId } });
    expect(freshRow.status).toBe("READY");
    expect(await objectStorage().head(fresh.row.objectKey ?? "")).not.toBeNull();
  });

  it("F14: a missing stored file fails the export with no object left", async () => {
    const broken = await seedExportPatient(world, { before: new Date(Date.now() - 200 * DAY), cpf: null });
    await objectStorage().delete(broken.keys[3] ?? "");
    const requestId = await requestOrThrow(world.admin, { patientId: broken.patientId, type: "ACCESS" });
    const before = await objectsUnder(`org/${world.organizationId}/privacy/`);
    const { outcome, row } = await exportOf(world, requestId);
    expect(outcome).toMatchObject({ status: "FAILED", errorCode: "FILE_MISSING" });
    expect(row).toMatchObject({ status: "FAILED", objectKey: null, errorCode: "FILE_MISSING" });
    expect(await objectsUnder(`org/${world.organizationId}/privacy/`)).toEqual(before);
    const request = await db().lgpdRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("FAILED");
    const download = await privacy.getExportDownload(world.admin, { exportId: row.id });
    expect(!download.ok && download.error.code).toBe("PRIVACY_EXPORT_NOT_READY");
  });

  it('F14: "Tentar novamente" after a failure builds a new export', async () => {
    const broken = await seedExportPatient(world, { before: new Date(Date.now() - 300 * DAY), cpf: null });
    const missing = broken.keys[2] ?? "";
    await objectStorage().delete(missing);
    const requestId = await requestOrThrow(world.admin, { patientId: broken.patientId, type: "ACCESS" });
    const failed = await exportOf(world, requestId);
    expect(failed.row.status).toBe("FAILED");
    await storeObject(missing, "%PDF-1.4 de volta");
    const retried = await exportOf(world, requestId);
    expect(retried.exportId).not.toBe(failed.exportId);
    expect(retried.row.status).toBe("READY");
    const request = await db().lgpdRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("COMPLETED");
    const detail = await privacy.getRequest(world.admin, requestId);
    expect(detail.ok && detail.value.exports.map((item) => item.status)).toEqual(["READY", "FAILED"]);
  });

  it("F14: a double request while building does not start a second export", async () => {
    const requestId = await requestOrThrow(world.admin, { patientId: bruna.patientId, type: "ACCESS" });
    const [first, second] = await Promise.all([
      privacy.requestExport(world.admin, { requestId }),
      privacy.requestExport(world.admin, { requestId }),
    ]);
    const codes = [first, second].map((result) => (result.ok ? "OK" : result.error.code)).sort();
    expect(codes).toEqual(["OK", "PRIVACY_EXPORT_IN_PROGRESS"]);
    const again = await privacy.requestExport(world.admin, { requestId });
    expect(!again.ok && again.error.code).toBe("PRIVACY_EXPORT_IN_PROGRESS");
    expect(await db().lgpdExport.count({ where: { requestId, status: "PROCESSING" } })).toBe(1);
    // The partial unique index refuses a second build row whatever the application does.
    await expect(
      db().lgpdExport.create({
        data: {
          id: newId(),
          organizationId: world.organizationId,
          requestId,
          locale: "pt-BR",
          requestedById: world.admin.user.id,
        },
      }),
    ).rejects.toThrow();
    const correction = await requestOrThrow(world.admin, { patientId: bruna.patientId, type: "CORRECTION" });
    const wrong = await privacy.requestExport(world.admin, { requestId: correction });
    expect(!wrong.ok && wrong.error.code).toBe("PRIVACY_REQUEST_TYPE_MISMATCH");
  });

  it("F14: requesting, generating and downloading an export are audited with the requester and the reason", async () => {
    const reason = "Paciente pediu cópia dos dados em 14/10.";
    const requestId = await requestOrThrow(world.admin, {
      patientId: bruna.patientId,
      type: "ACCESS",
      requestedBy: "REPRESENTATIVE",
      description: reason,
    });
    const { exportId } = await exportOf(world, requestId);
    const downloaded = await privacy.getExportDownload(world.admin, { exportId });
    expect(downloaded.ok).toBe(true);
    const events = await db().auditEvent.findMany({
      where: { action: "EXPORT", entityId: requestId },
      orderBy: { occurredAt: "asc" },
    });
    const phases = events.map((event) => (event.metadata as { phase: string }).phase);
    expect(phases).toEqual(["requested", "generated", "downloaded"]);
    const [requested, generated, download] = events;
    expect(requested?.metadata).toMatchObject({
      patientId: bruna.patientId,
      requestedBy: "REPRESENTATIVE",
      reason,
    });
    expect(requested?.actorUserId).toBe(world.admin.user.id);
    expect(generated?.actorType).toBe("SYSTEM");
    expect(generated?.metadata).toMatchObject({
      patientId: bruna.patientId,
      fileCount: 5,
      noteIds: [bruna.noteId],
      attachmentIds: [bruna.attachmentId],
    });
    expect(download?.metadata).toMatchObject({ requestId, exportId, requestedBy: "REPRESENTATIVE", reason });
    expect(download?.actorUserId).toBe(world.admin.user.id);
  });

  it("F14: an export never includes data of another patient or organization", async () => {
    const otherOrg = await createOrganization("Outra Clínica");
    const other = await schedulingWorld(otherOrg);
    const requestId = await requestOrThrow(world.admin, { patientId: bruna.patientId, type: "ACCESS" });
    const { row } = await exportOf(world, requestId);
    const zip = await zipOf(row.objectKey ?? "");
    const text = readZipFile(zip, "dados.json").toString("utf8");
    for (const foreign of [
      world.patients.maria,
      world.patients.joao,
      other.patients.maria,
      other.organizationId,
    ]) {
      expect(text).not.toContain(foreign);
    }
    expect(text).not.toContain("Maria Silva Oliveira");
    // The worker cannot build an export of one organization in the name of another.
    const cross = await privacy.buildExport({ organizationId: otherOrg, exportId: row.id });
    expect(cross.status).toBe("SKIPPED");
  });
});
