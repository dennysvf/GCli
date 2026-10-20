import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { billing } from "@/modules/billing";
import { patients } from "@/modules/patients";
import { createPrivacy, type TimelineItem, type TimelinePage } from "@/modules/privacy";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { objectStorage } from "@/shared/storage/object-storage";
import { DEFAULT_PASSWORD, signedInContext } from "../helpers";
import { createPatientOrThrow, cpfDoc, VALID_CPF } from "../patients/support";
import { billingWorld, chargeFor, moveTo, mustReceive } from "../billing/support";
import { insertNote } from "../clinical-records/support";
import { insertCategory, insertDocument } from "../documents/support";
import { booking, bookOrThrow, day, type Ctx } from "../scheduling/support";

// The F14 clinic: the billing clinic (front desk, manager, administrator, professional user "Ana"
// linked to Dra. Ana) plus the administrator linked to Dr. Bruno, so a linked administrator with
// records access exists next to the unlinked manager (spec decision D3).
export async function privacyWorld() {
  const world = await billingWorld();
  await db().professional.update({
    where: { id: world.professionals.bruno },
    data: { linkedUserId: world.admin.user.id },
  });
  const linkedAdmin = (await signedInContext({ email: world.admin.user.email, password: DEFAULT_PASSWORD }))
    .ctx;
  // The clinical helpers expect Bruno's user; here it is the linked administrator.
  return { ...world, linkedAdmin, brunoPro: linkedAdmin };
}

export type PrivacyWorld = Awaited<ReturnType<typeof privacyWorld>>;

export const privacy = createPrivacy();

const HOUR = 60 * 60 * 1000;

// A generated document needs its template (CHECK ck_patient_document_generated).
export async function insertTemplate(world: PrivacyWorld) {
  return db().documentTemplate.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      name: `Atestado ${newId().slice(-8)}`,
      type: "CERTIFICATE",
      bodyHtml: "<p>Atesto.</p>",
      bodyText: "Atesto.",
    },
  });
}

export async function insertAddendum(
  world: PrivacyWorld,
  noteId: string,
  options: { text?: string; professionalId?: string; authorUserId?: string; createdAt?: Date } = {},
) {
  const text = options.text ?? "Retorno em 30 dias.";
  return db().clinicalNoteAddendum.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      noteId,
      authorUserId: options.authorUserId ?? world.pro.user.id,
      professionalId: options.professionalId ?? world.professionals.ana,
      contentHtml: `<p>${text}</p>`,
      contentText: text,
      characters: text.length,
      ...(options.createdAt ? { createdAt: options.createdAt } : {}),
    },
  });
}

// Past appointments written directly, one per hour going back from `before`, for long histories.
export async function insertPastAppointments(
  world: PrivacyWorld,
  options: { patientId: string; count: number; professionalId?: string; before?: Date; status?: string },
): Promise<void> {
  const before = options.before ?? new Date(Date.now() - 30 * 24 * HOUR);
  await db().$executeRaw`
    INSERT INTO appointment (id, organization_id, unit_id, professional_id, service_id, patient_id,
      starts_at, ends_at, duration_minutes, price_minor, currency, status, status_changed_at,
      created_by_id, updated_by_id, created_at, updated_at)
    SELECT gen_random_uuid(), ${world.organizationId}::uuid, ${world.unitId}::uuid,
      ${options.professionalId ?? world.professionals.ana}::uuid, ${world.services.retorno}::uuid,
      ${options.patientId}::uuid,
      ${before}::timestamptz - make_interval(hours => g), ${before}::timestamptz - make_interval(hours => g) + interval '30 minutes',
      30, 12000, 'BRL', ${options.status ?? "COMPLETED"}, now(), ${world.desk.user.id}::uuid, ${world.desk.user.id}::uuid,
      now(), now()
    FROM generate_series(1, ${options.count}::int) AS g`;
}

// The patient Maria with every event type of the timeline (PRD F14 Capabilities):
// registered, consent, appointments with Dra. Ana (one completed with its whole status history) and
// Dr. Bruno, a future appointment, finalized notes of both professionals with an addendum, a draft
// that never appears, clinical and non-clinical uploads, an issued document, a failed one, a charge
// with a payment and a partial refund.
export async function seedRichHistory(world: PrivacyWorld) {
  const patientId = world.patients.maria;
  // Registered two months ago, so the registration is the oldest event of the timeline.
  await db().patient.update({
    where: { id: patientId },
    data: { createdAt: new Date(Date.now() - 60 * 24 * HOUR) },
  });
  const terms = await patients.publishTermsVersion(world.admin, {
    text: "Termos de privacidade da clínica. ".repeat(3),
  });
  if (!terms.ok) throw new Error(`publishTermsVersion failed: ${terms.error.code}`);
  const consent = await patients.recordConsent(world.desk, { patientId, method: "VERBAL" });
  if (!consent.ok) throw new Error(`recordConsent failed: ${consent.error.code}`);

  const withAna = await bookOrThrow(world.desk, booking(world, { date: day(1), startTime: "10:00" }));
  await moveTo(world.desk, withAna.appointmentId, ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"]);
  const withBruno = await bookOrThrow(
    world.desk,
    booking(world, {
      date: day(1),
      startTime: "15:00",
      professionalId: world.professionals.bruno,
      roomId: world.rooms.sala2,
    }),
  );
  await moveTo(world.desk, withBruno.appointmentId, ["CHECKED_IN"]);
  const future = await bookOrThrow(world.desk, booking(world, { date: day(7), startTime: "09:00" }));

  const charge = await chargeFor(withAna.appointmentId);
  const paid = await mustReceive(world, charge.id, 25_000, "PIX");
  const paymentId = paid.payments[0]?.id ?? "";
  const refund = await billing.refundPayment(world.manager, {
    chargeId: charge.id,
    paymentId,
    amountMinor: 5_000,
    reason: "Desconto concedido depois",
    unitId: world.unitId,
  });
  if (!refund.ok) throw new Error(`refundPayment failed: ${refund.error.code}`);

  const noteAna = await insertNote(world, {
    appointmentId: withAna.appointmentId,
    html: "<p>Paciente relata melhora da dor lombar.</p>",
    createdAt: new Date(Date.now() - 2 * HOUR),
  });
  const addendum = await insertAddendum(world, noteAna.id);
  const noteBruno = await insertNote(world, {
    appointmentId: withBruno.appointmentId,
    professionalId: world.professionals.bruno,
    authorUserId: world.admin.user.id,
    html: "<p>Avaliação inicial.</p>",
    createdAt: new Date(Date.now() - HOUR),
  });
  const draft = await insertNote(world, { status: "DRAFT", html: "<p>Rascunho.</p>" });

  const exam = await insertCategory(world, { name: "Exame", isClinical: true });
  const personal = await insertCategory(world, { name: "Documento pessoal" });
  const issued = await insertCategory(world, { name: "Documento emitido" });
  const template = await insertTemplate(world);
  const clinicalDoc = await insertDocument(world, {
    categoryId: exam.id,
    patientId,
    isClinical: true,
    title: "Exame de sangue",
  });
  const personalDoc = await insertDocument(world, {
    categoryId: personal.id,
    patientId,
    title: "RG digitalizado",
  });
  const generatedDoc = await insertDocument(world, {
    categoryId: issued.id,
    patientId,
    kind: "GENERATED",
    title: "Atestado",
    templateId: template.id,
    professionalId: world.professionals.ana,
    unitId: world.unitId,
  });
  const failedDoc = await insertDocument(world, {
    categoryId: personal.id,
    patientId,
    title: "Arquivo com falha",
  });
  await db().patientDocument.update({ where: { id: failedDoc.id }, data: { status: "FAILED" } });

  return {
    patientId,
    consentId: consent.value.consentId,
    appointments: {
      ana: withAna.appointmentId,
      bruno: withBruno.appointmentId,
      future: future.appointmentId,
    },
    chargeId: charge.id,
    chargeNumber: charge.number,
    paymentId,
    notes: { ana: noteAna.id, bruno: noteBruno.id, draft: draft.id },
    addendumId: addendum.id,
    documents: {
      clinical: clinicalDoc.id,
      personal: personalDoc.id,
      generated: generatedDoc.id,
      failed: failedDoc.id,
    },
  };
}

export type RichHistory = Awaited<ReturnType<typeof seedRichHistory>>;

export async function timelinePage(ctx: Ctx, input: Record<string, unknown>): Promise<TimelinePage> {
  const page = await privacy.getPatientTimeline(ctx, input);
  if (!page.ok) throw new Error(`getPatientTimeline failed: ${page.error.code}`);
  return page.value;
}

// Every page of the timeline, following the cursor.
export async function wholeTimeline(ctx: Ctx, input: Record<string, unknown>): Promise<TimelineItem[]> {
  const items: TimelineItem[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 500; guard++) {
    const page = await timelinePage(ctx, { ...input, cursor });
    items.push(...page.items);
    if (!page.nextCursor) return items;
    cursor = page.nextCursor;
  }
  throw new Error("the timeline did not end");
}

export function idOf(item: TimelineItem): string {
  return item.key.slice(item.key.indexOf(":") + 1);
}

export async function storeObject(
  key: string,
  content: string | Uint8Array,
  contentType = "application/pdf",
) {
  await objectStorage().put(
    key,
    typeof content === "string" ? new TextEncoder().encode(content) : content,
    contentType,
  );
}

export async function requestOrThrow(
  ctx: Ctx,
  input: { patientId: string; type: string; requestedBy?: string; description?: string },
) {
  const created = await privacy.createRequest(ctx, {
    requestedBy: "PATIENT",
    description: "Paciente pediu cópia dos dados em 14/10.",
    ...input,
  });
  if (!created.ok) throw new Error(`createRequest failed: ${created.error.code}`);
  return created.value.requestId;
}

// Sets the creation date of a request (the register tests need requests of past days).
export async function backdateRequest(requestId: string, createdAt: Date, completedAt?: Date) {
  await db().lgpdRequest.update({
    where: { id: requestId },
    data: {
      createdAt,
      ...(completedAt
        ? { status: "COMPLETED", completedAt, resolution: "Dados corrigidos no cadastro." }
        : {}),
    },
  });
}

// The export patient of the contract: "Bruna Teixeira" with known identity values, one consent with
// its signed term, two past appointments, a finalized note with a clinical attachment, a clinical
// upload, a non-clinical upload, an issued document and a charge with one payment: 5 stored files.
export async function seedExportPatient(
  world: PrivacyWorld,
  options: { before?: Date; cpf?: string | null } = {},
) {
  const cpf = options.cpf === undefined ? VALID_CPF : options.cpf;
  const patientId = await createPatientOrThrow(world.desk, {
    fullName: "Bruna Teixeira",
    birthDate: "1990-05-04",
    document: cpf ? cpfDoc(cpf) : null,
    mobilePhone: "(11) 97777-1234",
    email: "bruna.teixeira@exemplo.com.br",
  });
  const org = world.organizationId;
  let terms = await db().privacyTermsVersion.findFirst({ where: { organizationId: org } });
  terms ??= await db().privacyTermsVersion.create({
    data: { id: newId(), organizationId: org, version: 1, text: "Termos de privacidade da clínica." },
  });
  const consentKey = `org/${org}/patients/${newId()}`;
  await storeObject(consentKey, "%PDF-1.4 termo assinado");
  const consent = await db().consentRecord.create({
    data: {
      id: newId(),
      organizationId: org,
      patientId,
      termsVersionId: terms.id,
      method: "PAPER_UPLOADED",
      recordedById: world.desk.user.id,
      fileObjectKey: consentKey,
      fileName: "termo-assinado.pdf",
      fileSize: 24,
    },
  });
  await insertPastAppointments(world, {
    patientId,
    count: 2,
    before: options.before ?? new Date(Date.now() - 400 * 24 * HOUR),
  });
  const appointments = await db().appointment.findMany({
    where: { patientId },
    orderBy: { startsAt: "asc" },
  });
  const note = await insertNote(world, {
    patientId,
    appointmentId: appointments[0]?.id ?? null,
    html: "<p>Paciente relata melhora após a sessão.</p>",
  });
  const attachmentKey = `org/${org}/clinical/${newId()}`;
  await storeObject(attachmentKey, "imagem do exame", "image/jpeg");
  const attachment = await db().clinicalAttachment.create({
    data: {
      id: newId(),
      organizationId: org,
      noteId: note.id,
      uploadedById: world.pro.user.id,
      fileName: "raio-x.jpg",
      sourceContentType: "image/jpeg",
      sourceObjectKey: attachmentKey,
      objectKey: attachmentKey,
      contentType: "image/jpeg",
      sizeBytes: 15,
      status: "READY",
    },
  });
  const exam = await insertCategory(world, { name: `Exame ${newId().slice(-4)}`, isClinical: true });
  const personal = await insertCategory(world, { name: `Documento pessoal ${newId().slice(-4)}` });
  const template = await insertTemplate(world);
  const clinicalUpload = await insertDocument(world, {
    categoryId: exam.id,
    patientId,
    isClinical: true,
    title: "Exame de sangue",
  });
  const personalUpload = await insertDocument(world, {
    categoryId: personal.id,
    patientId,
    title: "RG digitalizado",
  });
  const generated = await insertDocument(world, {
    categoryId: personal.id,
    patientId,
    kind: "GENERATED",
    title: "Atestado",
    templateId: template.id,
    professionalId: world.professionals.ana,
    unitId: world.unitId,
  });
  for (const document of [clinicalUpload, personalUpload, generated]) {
    await storeObject(document.sourceObjectKey, `%PDF-1.4 ${document.title}`);
  }
  const charge = await billing.createManualCharge(world.desk, {
    patientId,
    unitId: world.unitId,
    description: "Avaliação",
    grossMinor: 15_000,
  });
  if (!charge.ok) throw new Error(`createManualCharge failed: ${charge.error.code}`);
  const paid = await mustReceive(world, charge.value.id, 15_000, "PIX");
  return {
    patientId,
    consentId: consent.id,
    appointmentIds: appointments.map((row) => row.id),
    noteId: note.id,
    attachmentId: attachment.id,
    documents: { clinical: clinicalUpload.id, personal: personalUpload.id, generated: generated.id },
    chargeId: charge.value.id,
    paymentId: paid.payments[0]?.id ?? "",
    keys: [
      consentKey,
      attachmentKey,
      clinicalUpload.sourceObjectKey,
      personalUpload.sourceObjectKey,
      generated.sourceObjectKey,
    ],
  };
}

export type ExportPatient = Awaited<ReturnType<typeof seedExportPatient>>;

// The worker side of an export: requests it as the administrator and runs the build job.
export async function exportOf(world: PrivacyWorld, requestId: string, ctx: Ctx = world.admin) {
  const requested = await privacy.requestExport(ctx, { requestId });
  if (!requested.ok) throw new Error(`requestExport failed: ${requested.error.code}`);
  const outcome = await privacy.buildExport({
    organizationId: world.organizationId,
    exportId: requested.value.exportId,
  });
  const row = await db().lgpdExport.findUniqueOrThrow({ where: { id: requested.value.exportId } });
  return { exportId: requested.value.exportId, outcome, row };
}

export async function zipOf(key: string): Promise<Buffer> {
  const stored = await objectStorage().get(key);
  if (!stored) throw new Error(`no object ${key}`);
  return Buffer.from(stored.body);
}

export async function objectsUnder(prefix: string): Promise<string[]> {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: prefix }));
  return (listed.Contents ?? []).map((item) => item.Key ?? "");
}
