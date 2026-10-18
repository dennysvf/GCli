import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TIMELINE_P95_MS } from "@/modules/privacy";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { closeHelpers, resetDatabase } from "../helpers";
import { insertCategory } from "../documents/support";
import { insertPastAppointments, privacy, privacyWorld, type PrivacyWorld } from "./support";
import type { Ctx } from "../scheduling/support";

// Spec F14 assumption 13: a patient with 10,000 events across every type, in an organization with
// 50,000 appointments of other patients; 20 runs per view, the first one a warm-up.
const RUNS = 20;

let world: PrivacyWorld;

async function seedHeavyPatient(world: PrivacyWorld) {
  const org = world.organizationId;
  const patientId = world.patients.maria;
  const desk = world.desk.user.id;
  const day = 24 * 60 * 60 * 1000;
  // 50,000 appointments of another patient with Dr. Bruno, and 4,000 of the heavy patient with Dra. Ana.
  await insertPastAppointments(world, {
    patientId: world.patients.joao,
    count: 50_000,
    professionalId: world.professionals.bruno,
  });
  await insertPastAppointments(world, { patientId, count: 4_000, before: new Date(Date.now() - day) });
  await db().$executeRaw`
    INSERT INTO appointment_status_change (id, organization_id, appointment_id, from_status, to_status, changed_at, changed_by_id)
    SELECT gen_random_uuid(), organization_id, id, NULL, 'SCHEDULED', created_at, ${desk}::uuid
    FROM appointment WHERE organization_id = ${org}::uuid AND patient_id = ${patientId}::uuid`;
  // 1,500 finalized standalone notes and 500 addenda.
  await db().$executeRaw`
    INSERT INTO clinical_note (id, organization_id, patient_id, kind, professional_id, author_user_id, status,
      content_html, content_text, characters, draft_saved_at, locks_at, finalized_at, created_at, updated_at)
    SELECT gen_random_uuid(), ${org}::uuid, ${patientId}::uuid, 'STANDALONE', ${world.professionals.ana}::uuid,
      ${world.pro.user.id}::uuid, 'FINALIZED', '<p>Evolução.</p>', 'Evolução.', 9, t, t + interval '24 hours', t, t, t
    FROM (SELECT now() - make_interval(hours => g * 3) AS t FROM generate_series(1, 1500) AS g) AS times`;
  await db().$executeRaw`
    INSERT INTO clinical_note_addendum (id, organization_id, note_id, author_user_id, professional_id,
      content_html, content_text, characters, created_at)
    SELECT gen_random_uuid(), organization_id, id, author_user_id, professional_id, '<p>Adendo.</p>', 'Adendo.', 7,
      created_at + interval '1 hour'
    FROM clinical_note WHERE organization_id = ${org}::uuid AND patient_id = ${patientId}::uuid
    ORDER BY created_at DESC LIMIT 500`;
  // 1,500 documents.
  const category = await insertCategory(world, { name: "Documento pessoal" });
  await db().$executeRaw`
    INSERT INTO patient_document (id, organization_id, patient_id, kind, category_id, title, is_clinical, status,
      file_name, source_content_type, source_object_key, object_key, content_type, size_bytes, stored_bytes,
      author_user_id, created_at, updated_at)
    SELECT gen_random_uuid(), ${org}::uuid, ${patientId}::uuid, 'UPLOADED', ${category.id}::uuid, 'Documento ' || g, false,
      'READY', 'documento.pdf', 'application/pdf', 'org/x/documents/' || g, 'org/x/documents/' || g,
      'application/pdf', 1000, 1000, ${desk}::uuid, now() - make_interval(hours => g * 2), now()
    FROM generate_series(1, 1500) AS g`;
  // 1,250 manual charges, each with one payment.
  await db().$executeRaw`
    INSERT INTO charge (id, organization_id, number, patient_id, origin, description, unit_id, currency,
      gross_minor, net_minor, paid_minor, status, created_by_id, created_at, updated_at)
    SELECT gen_random_uuid(), ${org}::uuid, 'P-' || lpad(g::text, 6, '0'), ${patientId}::uuid, 'MANUAL', 'Produto',
      ${world.unitId}::uuid, 'BRL', 10000, 10000, 10000, 'PAID', ${desk}::uuid, now() - make_interval(hours => g * 5), now()
    FROM generate_series(1, 1250) AS g`;
  await db().$executeRaw`
    INSERT INTO payment_submission (organization_id, id, charge_id, user_id, created_at)
    SELECT organization_id, id, id, ${desk}::uuid, created_at
    FROM charge WHERE organization_id = ${org}::uuid AND patient_id = ${patientId}::uuid`;
  await db().$executeRaw`
    INSERT INTO payment (id, organization_id, charge_id, kind, submission_id, method, amount_minor, currency, unit_id,
      received_at, user_id)
    SELECT gen_random_uuid(), organization_id, id, 'PAYMENT', id, 'PIX', 10000, 'BRL', unit_id,
      created_at + interval '10 minutes', ${desk}::uuid
    FROM charge WHERE organization_id = ${org}::uuid AND patient_id = ${patientId}::uuid`;
  const terms = await db().privacyTermsVersion.create({
    data: { id: newId(), organizationId: org, version: 1, text: "Termos." },
  });
  await db().$executeRaw`
    INSERT INTO consent_record (id, organization_id, patient_id, terms_version_id, consented_at, method, recorded_by_id)
    SELECT gen_random_uuid(), ${org}::uuid, ${patientId}::uuid, ${terms.id}::uuid, now() - make_interval(days => g),
      'VERBAL', ${desk}::uuid
    FROM generate_series(1, 250) AS g`;
  // Fresh statistics, as autovacuum would have after a bulk load (the owner role may analyze).
  const owner = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL, max: 1 });
  try {
    await owner.query("ANALYZE");
  } finally {
    await owner.end();
  }
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

async function measure(ctx: Ctx, input: Record<string, unknown>): Promise<number> {
  const samples: number[] = [];
  for (let run = 0; run <= RUNS; run++) {
    const started = performance.now();
    const page = await privacy.getPatientTimeline(ctx, input);
    const elapsed = performance.now() - started;
    expect(page.ok && page.value.items.length).toBe(50);
    if (run > 0) samples.push(elapsed);
  }
  return p95(samples);
}

// A cursor about 100 pages deep, for the deep-page measurement.
async function deepCursor(patientId: string): Promise<string> {
  const rows = await db().$queryRaw<{ starts_at: Date; id: string }[]>`
    SELECT starts_at, id FROM appointment WHERE patient_id = ${patientId}::uuid
    ORDER BY starts_at DESC, id DESC OFFSET 3000 LIMIT 1`;
  const row = rows[0];
  if (!row) throw new Error("no deep row");
  // Same opaque format as the use case (base64url JSON of time and id).
  return Buffer.from(JSON.stringify({ t: row.starts_at.toISOString(), i: row.id })).toString("base64url");
}

beforeAll(async () => {
  await resetDatabase();
  world = await privacyWorld();
  await seedHeavyPatient(world);
}, 600_000);
afterAll(closeHelpers);

describe("timeline performance", () => {
  it("F14: the first page loads within 2 seconds at p95", { timeout: 300_000 }, async () => {
    const total = await db().appointment.count();
    expect(total).toBeGreaterThanOrEqual(54_000);
    for (const ctx of [world.linkedAdmin, world.desk, world.pro]) {
      const value = await measure(ctx, { patientId: world.patients.maria });
      expect(value).toBeLessThanOrEqual(TIMELINE_P95_MS);
    }
  });

  it("F14: a deep page loads within 2 seconds at p95", { timeout: 300_000 }, async () => {
    for (const ctx of [world.linkedAdmin, world.desk, world.pro]) {
      const cursor = await deepCursor(world.patients.maria);
      const value = await measure(ctx, { patientId: world.patients.maria, cursor });
      expect(value).toBeLessThanOrEqual(TIMELINE_P95_MS);
    }
  });
});
