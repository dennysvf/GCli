import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { documents } from "@/modules/documents";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { appointmentFor } from "../clinical-records/support";
import { categoriesOf, pdfFile, uploadDocument, PDF_BYTES } from "./uploads";
import { documentsWorld, type DocumentsWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: DocumentsWorld;
let plainId: string;
let clinicalId: string;
beforeEach(async () => {
  world = await documentsWorld();
  const categories = await categoriesOf(world.desk);
  plainId = categories.plain.id;
  clinicalId = categories.clinical.id;
});

async function uploadAs(ctx: DocumentsWorld["desk"], categoryId: string, name = "exame.pdf") {
  const uploaded = await uploadDocument(ctx, {
    patientId: world.patients.maria,
    categoryId,
    file: pdfFile(name),
  });
  if (!uploaded.result.ok) throw new Error(`upload failed: ${uploaded.result.error.code}`);
  return uploaded.result.value;
}

describe("document access", () => {
  it("F08: documents in clinical categories are not visible to Front Desk", async () => {
    const clinical = await uploadAs(world.desk, clinicalId, "hemograma.pdf");
    const plain = await uploadAs(world.desk, plainId, "rg.pdf");
    // Front Desk can upload to a clinical category, but the document is not theirs to see.
    expect(clinical).toMatchObject({ clinical: true, visibleToUser: false });
    expect(plain).toMatchObject({ clinical: false, visibleToUser: true });

    const list = await documents.listPatientDocuments(world.desk, { patientId: world.patients.maria });
    expect(list.ok && list.value.items.map((item) => item.id)).toEqual([plain.documentId]);

    const opened = await documents.openDocument(world.desk, { documentId: clinical.documentId });
    expect(!opened.ok && opened.error.code).toBe("AUTHZ_FORBIDDEN");
    const denials = await auditEvents({ action: "PERMISSION_DENIED" });
    expect(
      denials.some((event) => (event.metadata as { target?: string } | null)?.target === clinical.documentId),
    ).toBe(true);

    // Front Desk cannot edit or archive it either.
    const archived = await documents.archiveDocument(world.manager, {
      documentId: clinical.documentId,
      reason: "Paciente errado",
      version: 1,
    });
    expect(!archived.ok && archived.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F08: a professional with an appointment with the patient sees clinical documents, and every reading is audited", async () => {
    const clinical = await uploadAs(world.desk, clinicalId, "hemograma.pdf");
    await uploadAs(world.desk, plainId, "rg.pdf");
    await appointmentFor(world);
    const list = await documents.listPatientDocuments(world.pro, { patientId: world.patients.maria });
    expect(list.ok && list.value.items).toHaveLength(2);
    const opened = await documents.openDocument(world.pro, { documentId: clinical.documentId });
    expect(opened.ok).toBe(true);

    const reads = await auditEvents({ action: "READ_SENSITIVE" });
    const listRead = reads.find((event) => event.entityType === "patient");
    expect(listRead?.metadata).toMatchObject({ documentIds: [clinical.documentId] });
    const openRead = reads.find((event) => event.entityType === "patient_document");
    expect(openRead).toMatchObject({ entityId: clinical.documentId });
    // The audit keeps IDs, never titles or file names.
    expect(JSON.stringify(reads)).not.toContain("hemograma");
  });

  it("F08: listing without clinical documents is not an audited read", async () => {
    await uploadAs(world.desk, plainId, "rg.pdf");
    await documents.listPatientDocuments(world.desk, { patientId: world.patients.maria });
    expect(await auditEvents({ action: "READ_SENSITIVE" })).toHaveLength(0);
  });

  it("F08: professionals without an appointment with the patient cannot see the patient's documents", async () => {
    await uploadAs(world.desk, plainId, "rg.pdf");
    const list = await documents.listPatientDocuments(world.pro, { patientId: world.patients.maria });
    expect(!list.ok && list.error.code).toBe("AUTHZ_FORBIDDEN");
    expect((await auditEvents({ action: "PERMISSION_DENIED" })).length).toBeGreaterThan(0);
    const intent = await documents.createUploadIntent(world.brunoPro, {
      patientId: world.patients.maria,
      categoryId: plainId,
      fileName: "x.pdf",
      contentType: "application/pdf",
      size: 10,
    });
    expect(!intent.ok && intent.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F08: the clinical rule is the F07 records policy: a manager not linked to a professional sees no clinical documents", async () => {
    await uploadAs(world.desk, clinicalId, "hemograma.pdf");
    await uploadAs(world.desk, plainId, "rg.pdf");
    const list = await documents.listPatientDocuments(world.manager, { patientId: world.patients.maria });
    expect(list.ok && list.value.items).toHaveLength(1);
    // Another professional with an appointment with the patient is allowed.
    await appointmentFor(world, { professionalId: world.professionals.bruno });
    const bruno = await documents.listPatientDocuments(world.brunoPro, { patientId: world.patients.maria });
    expect(bruno.ok && bruno.value.items).toHaveLength(2);
  });

  it("F08: document URLs expire after 5 minutes and serve the stored bytes", async () => {
    const stored = await uploadAs(world.desk, plainId, "rg.pdf");
    const opened = await documents.openDocument(world.desk, { documentId: stored.documentId });
    if (!opened.ok) throw new Error("open failed");
    expect(opened.value.expiresInSeconds).toBe(300);
    const url = new URL(opened.value.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-disposition")).toContain('inline; filename="rg.pdf"');
    const download = await fetch(opened.value.url);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(PDF_BYTES);
    const forced = await documents.openDocument(world.desk, {
      documentId: stored.documentId,
      disposition: "attachment",
    });
    expect(forced.ok && new URL(forced.value.url).searchParams.get("response-content-disposition")).toContain(
      "attachment;",
    );
  });

  it("F08: documents are isolated per organization", async () => {
    const other = await documentsWorld();
    const otherCategories = await categoriesOf(other.desk);
    const foreign = await uploadDocument(other.desk, {
      patientId: other.patients.maria,
      categoryId: otherCategories.plain.id,
      file: pdfFile("alheio.pdf"),
    });
    if (!foreign.result.ok) throw new Error("upload failed");
    const opened = await documents.openDocument(world.desk, { documentId: foreign.result.value.documentId });
    expect(!opened.ok && opened.error.code).toBe("DOCUMENT_NOT_FOUND");
    const list = await documents.listPatientDocuments(world.desk, { patientId: other.patients.maria });
    expect(list.ok).toBe(false);
    // Categories and usage are per organization too.
    expect(await db().documentCategory.count({ where: { organizationId: world.organizationId } })).toBe(
      await db().documentCategory.count({ where: { organizationId: other.organizationId } }),
    );
    const usage = await documents.getStorageUsage(world.desk);
    expect(usage.ok && usage.value.usedBytes).toBe(0);
  });
});
