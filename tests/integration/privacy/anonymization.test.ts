import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { billing } from "@/modules/billing";
import { createPrivacy } from "@/modules/privacy";
import { db } from "@/shared/db/client";
import { fail } from "@/shared/kernel/result";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { objectStorage } from "@/shared/storage/object-storage";
import { eraseDocumentFileJob } from "@/worker/jobs/documents";
import { closeHelpers, resetDatabase } from "../helpers";
import { insertNote } from "../clinical-records/support";
import { insertCategory, insertDocument } from "../documents/support";
import { createPatientOrThrow, cpfDoc, OTHER_CPF, VALID_CPF } from "../patients/support";
import { booking, bookOrThrow, day } from "../scheduling/support";
import { mustReceive } from "../billing/support";
import {
  exportOf,
  insertPastAppointments,
  insertTemplate,
  privacy,
  privacyWorld,
  requestOrThrow,
  storeObject,
  wholeTimeline,
  type PrivacyWorld,
} from "./support";

let world: PrivacyWorld;

beforeAll(async () => {
  await resetDatabase();
  world = await privacyWorld();
});
afterAll(closeHelpers);

const DAY = 24 * 60 * 60 * 1000;
let pastOffset = 500;

// An adult patient with every identifier, a past completed appointment with a front desk note, a
// fully paid charge, a stored non-clinical upload, an issued document and a consent: eligible.
async function eligiblePatient(fullName = "Rafael Mendes Costa", cpf: string | null = null) {
  const patientId = await createPatientOrThrow(world.desk, {
    fullName,
    socialName: "Rafa Costa",
    birthDate: "1985-03-02",
    sex: "MALE",
    document: cpf ? cpfDoc(cpf) : null,
    rg: "123456789",
    mobilePhone: "(11) 96666-5555",
    secondaryPhone: "(11) 3333-4444",
    email: `${newId().slice(-6)}.rafael@exemplo.com.br`,
    observations: "Prefere atendimento pela manhã.",
    guardian: { name: "Carla Mendes", relationship: "MOTHER", phone: "(11) 97777-6666" },
  });
  pastOffset += 50;
  await insertPastAppointments(world, {
    patientId,
    count: 1,
    before: new Date(Date.now() - pastOffset * DAY),
  });
  await db().appointment.updateMany({ where: { patientId }, data: { notes: `Ligar para ${fullName}` } });
  const charge = await billing.createManualCharge(world.desk, {
    patientId,
    unitId: world.unitId,
    description: "Avaliação",
    grossMinor: 10_000,
  });
  if (!charge.ok) throw new Error(charge.error.code);
  await mustReceive(world, charge.value.id, 10_000, "PIX");
  const personal = await insertCategory(world, { name: `Documento pessoal ${newId().slice(-6)}` });
  const upload = await insertDocument(world, {
    categoryId: personal.id,
    patientId,
    title: "RG digitalizado",
  });
  await storeObject(upload.sourceObjectKey, "%PDF-1.4 rg");
  await storeObject(upload.objectKey ?? "", "%PDF-1.4 rg");
  const template = await insertTemplate(world);
  const generated = await insertDocument(world, {
    categoryId: personal.id,
    patientId,
    kind: "GENERATED",
    title: "Atestado",
    templateId: template.id,
    professionalId: world.professionals.ana,
    unitId: world.unitId,
  });
  await storeObject(generated.sourceObjectKey, "%PDF-1.4 atestado");
  const terms =
    (await db().privacyTermsVersion.findFirst({ where: { organizationId: world.organizationId } })) ??
    (await db().privacyTermsVersion.create({
      data: { id: newId(), organizationId: world.organizationId, version: 1, text: "Termos." },
    }));
  const consent = await db().consentRecord.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      patientId,
      termsVersionId: terms.id,
      method: "VERBAL",
      recordedById: world.desk.user.id,
    },
  });
  const requestId = await requestOrThrow(world.admin, {
    patientId,
    type: "ANONYMIZATION",
    description: "Paciente pediu a exclusão dos dados pessoais.",
  });
  return { patientId, chargeId: charge.value.id, upload, generated, consentId: consent.id, requestId };
}

async function versionOf(requestId: string) {
  return (await db().lgpdRequest.findUniqueOrThrow({ where: { id: requestId } })).version;
}

async function anonymize(requestId: string, typedName: string, client = privacy) {
  return client.anonymizePatient(world.admin, { requestId, typedName, version: await versionOf(requestId) });
}

describe("anonymization", () => {
  it("F14: anonymization replaces every personal identifier with the placeholder", async () => {
    const patient = await eligiblePatient("Rafael Mendes Costa", VALID_CPF);
    const preview = await privacy.previewAnonymization(world.admin, { requestId: patient.requestId });
    expect(preview.ok && preview.value.outcome).toBe("ELIGIBLE");
    const result = await anonymize(patient.requestId, "  rafael MENDES costa ");
    expect(result.ok && result.value.outcome).toBe("ANONYMIZED");
    if (!result.ok || result.value.outcome !== "ANONYMIZED") return;
    expect(result.value.placeholder).toMatch(/^Paciente anonimizado #[0-9A-F]{6}$/);
    expect(result.value.erasedDocuments).toBe(1);
    const row = await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } });
    expect(row).toMatchObject({
      fullName: result.value.placeholder,
      socialName: null,
      documentType: null,
      documentNumber: null,
      rg: null,
      mobilePhone: "",
      secondaryPhone: null,
      phoneDigits: "",
      email: null,
      addressCountry: null,
      postalCode: null,
      street: null,
      city: null,
      guardianName: null,
      guardianPhone: null,
      observations: null,
      active: false,
      inactiveReason: "ANONYMIZED",
    });
    expect(row.anonymizedAt).not.toBeNull();
    expect(row.anonymizedCode).toBe(result.value.placeholder.slice(-6));
    expect(row.mobilePhone).not.toMatch(/\d/);
    // Birth date and sex stay for statistics.
    expect(row.birthDate.toISOString().slice(0, 10)).toBe("1985-03-02");
    expect(row.sex).toBe("MALE");
    const request = await db().lgpdRequest.findUniqueOrThrow({ where: { id: patient.requestId } });
    expect(request.status).toBe("COMPLETED");
    expect(request.completedAt).not.toBeNull();
    const again = await anonymize(patient.requestId, "Rafael Mendes Costa");
    expect(!again.ok && again.error.code).toBe("PRIVACY_REQUEST_CLOSED");
  });

  it("F14: appointments, charges and payments keep their rows under the anonymized identity", async () => {
    const patient = await eligiblePatient("Otávio Lima Prado");
    const before = await db().appointment.findMany({ where: { patientId: patient.patientId } });
    const result = await anonymize(patient.requestId, "Otavio Lima Prado");
    expect(result.ok).toBe(true);
    const after = await db().appointment.findMany({ where: { patientId: patient.patientId } });
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(after.every((row) => row.notes === null)).toBe(true);
    const charge = await db().charge.findUniqueOrThrow({
      where: { id: patient.chargeId },
      include: { payments: true },
    });
    expect(charge.patientId).toBe(patient.patientId);
    expect(charge.payments).toHaveLength(1);
    const items = await wholeTimeline(world.admin, { patientId: patient.patientId });
    const kinds = new Set(items.map((item) => item.kind));
    expect(kinds).toEqual(
      new Set([
        "PATIENT_REGISTERED",
        "CONSENT_RECORDED",
        "APPOINTMENT",
        "CHARGE_CREATED",
        "PAYMENT_RECEIVED",
        "DOCUMENT_UPLOADED",
        "DOCUMENT_GENERATED",
      ]),
    );
  });

  it("F14: non-clinical uploaded documents are erased and their files deleted, and their rows remain", async () => {
    const patient = await eligiblePatient("Sérgio Antunes Leal");
    const result = await anonymize(patient.requestId, "Sergio Antunes Leal");
    expect(result.ok).toBe(true);
    const row = await db().patientDocument.findUniqueOrThrow({ where: { id: patient.upload.id } });
    expect(row.erasedAt).not.toBeNull();
    expect(row.erasedById).toBe(world.admin.user.id);
    expect(row.title).toBe("—");
    expect(row.archivedAt).not.toBeNull();
    const messages = await db().outboxMessage.findMany({ where: { type: "documents.file-erase" } });
    const message = messages.find((item) => (item.payload as { documentId: string }).documentId === row.id);
    expect(message).toBeDefined();
    expect(await objectStorage().head(patient.upload.sourceObjectKey)).not.toBeNull();
    await eraseDocumentFileJob({ payload: message?.payload as Record<string, unknown> });
    expect(await objectStorage().head(patient.upload.sourceObjectKey)).toBeNull();
    expect(await objectStorage().head(patient.upload.objectKey ?? "")).toBeNull();
  });

  it("F14: generated documents and consent records are kept", async () => {
    const patient = await eligiblePatient("Tiago Rocha Nunes");
    expect((await anonymize(patient.requestId, "Tiago Rocha Nunes")).ok).toBe(true);
    const generated = await db().patientDocument.findUniqueOrThrow({ where: { id: patient.generated.id } });
    expect(generated).toMatchObject({ erasedAt: null, title: "Atestado", archivedAt: null });
    expect(await db().consentRecord.findUnique({ where: { id: patient.consentId } })).not.toBeNull();
  });

  it("F14: the audit of an anonymization lists field names without the old values", async () => {
    const started = new Date();
    const patient = await eligiblePatient("Rafael Souza Brito", OTHER_CPF);
    const email = (await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } })).email ?? "";
    const since = new Date();
    expect((await anonymize(patient.requestId, "Rafael Souza Brito")).ok).toBe(true);
    const events = await db().auditEvent.findMany({ where: { occurredAt: { gte: since } } });
    expect(events.length).toBeGreaterThanOrEqual(4);
    const text = JSON.stringify(events);
    for (const value of ["Rafael", OTHER_CPF, email, "96666", "Carla Mendes", "Ligar para"]) {
      expect(text).not.toContain(value);
    }
    const patientEvent = events.find(
      (event) => event.entityType === "patient" && event.entityId === patient.patientId,
    );
    expect((patientEvent?.metadata as { fields: string[] }).fields).toEqual(
      expect.arrayContaining([
        "fullName",
        "socialName",
        "document",
        "rg",
        "mobilePhone",
        "email",
        "address",
        "guardian",
      ]),
    );
    expect(started.getTime()).toBeLessThanOrEqual(since.getTime());
  });

  it("F14: an anonymized patient's identity cannot be changed, even by direct SQL", async () => {
    const patient = await eligiblePatient("Rafael Mendes Costa");
    expect((await anonymize(patient.requestId, "Rafael Mendes Costa")).ok).toBe(true);
    await expect(
      db()
        .$executeRaw`UPDATE patient SET full_name = 'Rafael Mendes Costa' WHERE id = ${patient.patientId}::uuid`,
    ).rejects.toThrow(/PATIENT_ANONYMIZED_IMMUTABLE/);
    await expect(
      db()
        .$executeRaw`UPDATE patient SET anonymized_at = NULL, anonymized_code = NULL WHERE id = ${patient.patientId}::uuid`,
    ).rejects.toThrow();
    const row = await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } });
    expect(row.fullName).toMatch(/^Paciente anonimizado #/);
    const reactivate = await import("@/modules/patients").then(({ patients }) =>
      patients.setPatientActive(world.desk, { patientId: patient.patientId, active: true }),
    );
    expect(!reactivate.ok && reactivate.error.code).toBe("PATIENTS_ANONYMIZED");
    const anotherRequest = await privacy.createRequest(world.admin, {
      patientId: patient.patientId,
      type: "ANONYMIZATION",
      requestedBy: "PATIENT",
      description: "Novo pedido de exclusão.",
    });
    expect(!anotherRequest.ok && anotherRequest.error.code).toBe("PRIVACY_PATIENT_ANONYMIZED");
  });

  it("F14: a patient with a clinical note is not anonymized and the request becomes legal retention", async () => {
    const patient = await eligiblePatient("Clara Nunes Vieira");
    await insertNote(world, { patientId: patient.patientId, html: "<p>Evolução.</p>" });
    const preview = await privacy.previewAnonymization(world.admin, { requestId: patient.requestId });
    expect(preview.ok && preview.value.outcome).toBe("LEGAL_RETENTION");
    const before = await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } });
    // Retention is recorded whatever is typed: nothing personal changes.
    const result = await anonymize(patient.requestId, "");
    expect(result.ok && result.value.outcome).toBe("LEGAL_RETENTION");
    const request = await db().lgpdRequest.findUniqueOrThrow({ where: { id: patient.requestId } });
    expect(request.status).toBe("LEGAL_RETENTION");
    expect(request.completedAt).not.toBeNull();
    expect(await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } })).toEqual(before);
    const audit = await db().auditEvent.findFirst({
      where: { entityType: "lgpd_request", entityId: patient.requestId, action: "UPDATE" },
    });
    expect(audit?.changes).toMatchObject({ status: { after: "LEGAL_RETENTION" } });
  });

  it("F14: a patient with only a clinical document is not anonymized and the request becomes legal retention", async () => {
    const patient = await eligiblePatient("Diego Faria Lopes");
    const exam = await insertCategory(world, { name: `Exame ${newId().slice(-6)}`, isClinical: true });
    await insertDocument(world, {
      categoryId: exam.id,
      patientId: patient.patientId,
      isClinical: true,
      title: "Exame",
    });
    const result = await anonymize(patient.requestId, "Diego Faria Lopes");
    expect(result.ok && result.value.outcome).toBe("LEGAL_RETENTION");
    const row = await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } });
    expect(row.anonymizedAt).toBeNull();
    expect(row.fullName).toBe("Diego Faria Lopes");
  });

  it("F14: a patient with a clinical alert is not anonymized", async () => {
    const patient = await eligiblePatient("Elisa Moura Dias");
    await db().clinicalAlert.create({
      data: {
        id: newId(),
        organizationId: world.organizationId,
        patientId: patient.patientId,
        text: "Alergia a dipirona",
        updatedById: world.pro.user.id,
      },
    });
    const result = await anonymize(patient.requestId, "Elisa Moura Dias");
    expect(result.ok && result.value.outcome).toBe("LEGAL_RETENTION");
    expect(
      (await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } })).anonymizedAt,
    ).toBeNull();
  });

  it("F14: a future appointment blocks anonymization with no change", async () => {
    const patient = await eligiblePatient("Fábio Teles Rios");
    await bookOrThrow(
      world.desk,
      booking(world, { patientId: patient.patientId, date: day(3), startTime: "16:00" }),
    );
    const preview = await privacy.previewAnonymization(world.admin, { requestId: patient.requestId });
    expect(preview.ok && preview.value).toMatchObject({
      outcome: "BLOCKED",
      findings: { futureAppointments: 1 },
    });
    const before = await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } });
    const audits = await db().auditEvent.count();
    const result = await anonymize(patient.requestId, "Fábio Teles Rios");
    expect(!result.ok && result.error.code).toBe("PRIVACY_ANONYMIZATION_BLOCKED");
    expect(await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } })).toEqual(before);
    expect((await db().lgpdRequest.findUniqueOrThrow({ where: { id: patient.requestId } })).status).toBe(
      "PENDING",
    );
    expect(await db().auditEvent.count()).toBe(audits);
  });

  it("F14: an open charge blocks anonymization with no change", async () => {
    const patient = await eligiblePatient("Gabriela Reis Pinto");
    const open = await billing.createManualCharge(world.desk, {
      patientId: patient.patientId,
      unitId: world.unitId,
      description: "Pacote de exames",
      grossMinor: 5_000,
    });
    expect(open.ok).toBe(true);
    const before = await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } });
    const result = await anonymize(patient.requestId, "Gabriela Reis Pinto");
    expect(!result.ok && result.error.code).toBe("PRIVACY_ANONYMIZATION_BLOCKED");
    expect(await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } })).toEqual(before);
    expect((await db().lgpdRequest.findUniqueOrThrow({ where: { id: patient.requestId } })).status).toBe(
      "PENDING",
    );
  });

  it("F14: a mismatched name does not anonymize", async () => {
    const patient = await eligiblePatient("Helena Duarte Ramos");
    const before = await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } });
    const result = await anonymize(patient.requestId, "Helena Ramos");
    expect(!result.ok && result.error.code).toBe("PRIVACY_NAME_MISMATCH");
    expect(!result.ok && result.error.fields?.typedName).toBe("privacy.errors.PRIVACY_NAME_MISMATCH");
    expect(await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } })).toEqual(before);
    const updates = await db().auditEvent.count({
      where: { action: "UPDATE", entityType: "patient", entityId: patient.patientId },
    });
    expect(updates).toBe(0);
  });

  it("F14: ready exports of the patient are expired and deleted on anonymization", async () => {
    const patient = await eligiblePatient("Igor Batista Cruz");
    const access = await requestOrThrow(world.admin, { patientId: patient.patientId, type: "ACCESS" });
    const built = await exportOf(world, access);
    expect(built.row.status).toBe("READY");
    expect((await anonymize(patient.requestId, "Igor Batista Cruz")).ok).toBe(true);
    const expired = await db().lgpdExport.findUniqueOrThrow({ where: { id: built.exportId } });
    expect(expired).toMatchObject({ status: "EXPIRED", objectKey: null });
    const message = (await db().outboxMessage.findMany({ where: { type: "privacy.export-delete" } })).find(
      (item) => (item.payload as { exportId: string }).exportId === built.exportId,
    );
    expect((message?.payload as { objectKey: string }).objectKey).toBe(built.row.objectKey);
    await privacy.deleteExportFile({ objectKey: built.row.objectKey ?? "" });
    expect(await objectStorage().head(built.row.objectKey ?? "")).toBeNull();
  });

  it("F14: a failure in any step rolls back the whole anonymization", async () => {
    const patient = await eligiblePatient("Júlia Castro Melo");
    const failing = createPrivacy((base) => ({
      ...base,
      steps: { ...base.steps, clearAppointmentNotes: async () => fail(CommonErrors.staleVersion()) },
    }));
    const before = await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } });
    const result = await anonymize(patient.requestId, "Júlia Castro Melo", failing);
    expect(!result.ok && result.error.code).toBe("CONFLICT_STALE_VERSION");
    expect(await db().patient.findUniqueOrThrow({ where: { id: patient.patientId } })).toEqual(before);
    const upload = await db().patientDocument.findUniqueOrThrow({ where: { id: patient.upload.id } });
    expect(upload.erasedAt).toBeNull();
    expect((await db().lgpdRequest.findUniqueOrThrow({ where: { id: patient.requestId } })).status).toBe(
      "PENDING",
    );
    expect(
      await db().auditEvent.count({
        where: { action: "UPDATE", entityType: "patient", entityId: patient.patientId },
      }),
    ).toBe(0);
  });

  it("F14: only administrators can anonymize", async () => {
    const patient = await eligiblePatient("Kátia Freitas Gomes");
    for (const ctx of [world.manager, world.desk, world.pro]) {
      const preview = await privacy.previewAnonymization(ctx, { requestId: patient.requestId });
      expect(!preview.ok && preview.error.code).toBe("AUTHZ_FORBIDDEN");
      const result = await privacy.anonymizePatient(ctx, {
        requestId: patient.requestId,
        typedName: "Kátia Freitas Gomes",
        version: 1,
      });
      expect(!result.ok && result.error.code).toBe("AUTHZ_FORBIDDEN");
    }
  });
});
