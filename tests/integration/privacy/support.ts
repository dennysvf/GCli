import { billing } from "@/modules/billing";
import { patients } from "@/modules/patients";
import { createPrivacy, type TimelineItem, type TimelinePage } from "@/modules/privacy";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { DEFAULT_PASSWORD, signedInContext } from "../helpers";
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
      name: `Atestado ${newId().slice(0, 6)}`,
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
