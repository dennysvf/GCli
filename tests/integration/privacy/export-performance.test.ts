import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPORT_FILE_TARGET, EXPORT_TIME_BUDGET_MS } from "@/modules/privacy";
import { db } from "@/shared/db/client";
import { objectStorage } from "@/shared/storage/object-storage";
import { readZipEntriesFromTail } from "../../zip-reader";
import { closeHelpers, resetDatabase } from "../helpers";
import { insertNote } from "../clinical-records/support";
import { insertCategory } from "../documents/support";
import { createPatientOrThrow } from "../patients/support";
import {
  exportOf,
  insertPastAppointments,
  privacyWorld,
  requestOrThrow,
  storeObject,
  type PrivacyWorld,
} from "./support";

// Spec F14 assumption 13: a patient with 500 stored files of 1 MB to 20 MB (2 MB on average, about
// 1 GB in total), plus 500 appointments and 200 notes. The stored objects are shared by the rows
// (the export still reads and writes every byte of every file), which keeps the setup short.
const MB = 1024 * 1024;
const SIZES_MB = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 6, 20];

let world: PrivacyWorld;
let patientId: string;

beforeAll(async () => {
  await resetDatabase();
  world = await privacyWorld();
  patientId = await createPatientOrThrow(world.desk, { fullName: "Paciente Volumoso", document: null });
  const keys: string[] = [];
  for (const [index, size] of SIZES_MB.entries()) {
    const key = `org/${world.organizationId}/documents/perf-${index}`;
    await storeObject(key, randomBytes(size * MB), "application/octet-stream");
    keys.push(key);
  }
  const category = await insertCategory(world, { name: "Documento pessoal" });
  await db().$executeRaw`
    INSERT INTO patient_document (id, organization_id, patient_id, kind, category_id, title, is_clinical, status,
      file_name, source_content_type, source_object_key, object_key, content_type, size_bytes, stored_bytes,
      author_user_id, created_at, updated_at)
    SELECT gen_random_uuid(), ${world.organizationId}::uuid, ${patientId}::uuid, 'UPLOADED', ${category.id}::uuid,
      'Documento ' || g, false, 'READY', 'documento-' || g || '.bin', 'application/octet-stream',
      (${keys}::text[])[1 + (g % ${keys.length})], (${keys}::text[])[1 + (g % ${keys.length})],
      'application/octet-stream', 1000, 1000, ${world.desk.user.id}::uuid, now() - make_interval(hours => g), now()
    FROM generate_series(1, ${EXPORT_FILE_TARGET}::int) AS g`;
  await insertPastAppointments(world, { patientId, count: 500 });
  for (let index = 0; index < 200; index++) {
    await insertNote(world, { patientId, html: `<p>Evolução ${index}.</p>` });
  }
}, 900_000);
afterAll(closeHelpers);

describe("export performance", () => {
  it("F14: an export of 500 files is ready within 5 minutes", { timeout: 900_000 }, async () => {
    const requestId = await requestOrThrow(world.admin, { patientId, type: "ACCESS" });
    const started = Date.now();
    const { row } = await exportOf(world, requestId);
    const elapsed = Date.now() - started;
    expect(row.status).toBe("READY");
    expect(elapsed).toBeLessThanOrEqual(EXPORT_TIME_BUDGET_MS);
    // Only the end of the ZIP is read: the central directory lists every entry.
    const size = Number(row.sizeBytes);
    const tailLength = Math.min(size, 512 * 1024);
    const tail = await objectStorage().getRange(row.objectKey ?? "", tailLength, size - tailLength);
    const names = readZipEntriesFromTail(Buffer.from(tail ?? new Uint8Array()), size).map(
      (entry) => entry.name,
    );
    expect(names.filter((name) => name.startsWith("arquivos/"))).toHaveLength(EXPORT_FILE_TARGET);
    expect(names).toContain("dados.json");
    expect(names).toContain("resumo.pdf");
    expect(Number(row.sizeBytes)).toBeGreaterThan(900 * MB);
  });
});
