import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { closeHelpers, resetDatabase } from "../helpers";
import { documentsWorld, insertCategory, insertDocument, type DocumentsWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: DocumentsWorld;
beforeEach(async () => {
  world = await documentsWorld();
});

async function insertTemplate(overrides: { name?: string; systemKey?: string | null; type?: string } = {}) {
  return db().documentTemplate.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      name: overrides.name ?? `Modelo ${newId().slice(0, 8)}`,
      type: overrides.type ?? "CERTIFICATE",
      bodyHtml: "<p>Texto</p>",
      bodyText: "Texto",
      systemKey: overrides.systemKey ?? null,
    },
  });
}

describe("patient documents schema", () => {
  it("F08: the database refuses turning a document's clinical flag off", async () => {
    const category = await insertCategory(world, { isClinical: true });
    const document = await insertDocument(world, { categoryId: category.id, isClinical: true });
    await expect(
      db().patientDocument.update({ where: { id: document.id }, data: { isClinical: false } }),
    ).rejects.toThrow(/DOCUMENT_CLINICAL_FLAG_LOCKED/);
    // Turning it on is allowed, and a clinical document can be edited in other ways.
    const plain = await insertDocument(world, { categoryId: category.id, isClinical: false });
    const marked = await db().patientDocument.update({ where: { id: plain.id }, data: { isClinical: true } });
    expect(marked.isClinical).toBe(true);
    const retitled = await db().patientDocument.update({
      where: { id: document.id },
      data: { title: "Novo" },
    });
    expect(retitled.title).toBe("Novo");
  });

  it("F08: documents, categories and templates cannot be deleted by the application role", async () => {
    const category = await insertCategory(world);
    const document = await insertDocument(world, { categoryId: category.id });
    const template = await insertTemplate();
    await expect(db().patientDocument.delete({ where: { id: document.id } })).rejects.toThrow(
      /permission denied/,
    );
    await expect(db().documentCategory.delete({ where: { id: category.id } })).rejects.toThrow(
      /permission denied/,
    );
    await expect(db().documentTemplate.delete({ where: { id: template.id } })).rejects.toThrow(
      /permission denied/,
    );
  });

  it("F08: an archive always has a reason and an author", async () => {
    const category = await insertCategory(world);
    const document = await insertDocument(world, { categoryId: category.id });
    await expect(
      db().patientDocument.update({ where: { id: document.id }, data: { archivedAt: new Date() } }),
    ).rejects.toThrow(/ck_patient_document_archive/);
    const archived = await db().patientDocument.update({
      where: { id: document.id },
      data: { archivedAt: new Date(), archiveReason: "Paciente errado", archivedById: world.manager.user.id },
    });
    expect(archived.archiveReason).toBe("Paciente errado");
  });

  it("F08: a generated document names its template, professional and unit", async () => {
    const category = await insertCategory(world, { systemKey: "ISSUED" });
    await expect(insertDocument(world, { categoryId: category.id, kind: "GENERATED" })).rejects.toThrow(
      /ck_patient_document_generated/,
    );
    const template = await insertTemplate();
    const generated = await insertDocument(world, {
      categoryId: category.id,
      kind: "GENERATED",
      templateId: template.id,
      professionalId: world.professionals.ana,
      unitId: world.unitId,
    });
    expect(generated.kind).toBe("GENERATED");
  });

  it("F08: category and template names are unique per organization ignoring case", async () => {
    await insertCategory(world, { name: "Exame" });
    await expect(insertCategory(world, { name: "exame" })).rejects.toThrow();
    await insertTemplate({ name: "Atestado" });
    await expect(insertTemplate({ name: "ATESTADO" })).rejects.toThrow();
    // Another organization can use the same names.
    const other = await documentsWorld();
    await expect(
      db().documentCategory.create({
        data: { id: newId(), organizationId: other.organizationId, name: "Exame" },
      }),
    ).resolves.toBeTruthy();
  });

  it("F08: each default category and template exists once per organization", async () => {
    await insertCategory(world, { name: "Documento emitido", systemKey: "ISSUED" });
    await expect(insertCategory(world, { name: "Outro nome", systemKey: "ISSUED" })).rejects.toThrow();
    await insertTemplate({ name: "Atestado", systemKey: "CERTIFICATE" });
    await expect(insertTemplate({ name: "Outro", systemKey: "CERTIFICATE" })).rejects.toThrow();
  });

  it("F08: the database checks sizes, titles, template types and the usage counter", async () => {
    const category = await insertCategory(world);
    await expect(insertDocument(world, { categoryId: category.id, sizeBytes: 0 })).rejects.toThrow(
      /ck_patient_document_size/,
    );
    await expect(insertDocument(world, { categoryId: category.id, title: "   " })).rejects.toThrow(
      /ck_patient_document_title/,
    );
    await expect(insertTemplate({ type: "LETTER" })).rejects.toThrow(/ck_document_template_type/);
    await db().documentStorageUsage.upsert({
      where: { organizationId: world.organizationId },
      create: { organizationId: world.organizationId, usedBytes: BigInt(10) },
      update: {},
    });
    await expect(
      db().documentStorageUsage.update({
        where: { organizationId: world.organizationId },
        data: { usedBytes: BigInt(-1) },
      }),
    ).rejects.toThrow(/ck_document_storage_usage/);
  });

  it("F08: patient document records expose type, category, title, date, author, file and clinical flag", async () => {
    const category = await insertCategory(world, { isClinical: true });
    const document = await insertDocument(world, {
      categoryId: category.id,
      isClinical: true,
      title: "Exame",
    });
    const row = await db().patientDocument.findUniqueOrThrow({
      where: { id: document.id },
      include: { category: true },
    });
    expect(row).toMatchObject({
      kind: "UPLOADED",
      title: "Exame",
      isClinical: true,
      authorUserId: world.desk.user.id,
      contentType: "application/pdf",
    });
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.sourceObjectKey).toMatch(/^org\/.+\/documents\//);
    expect(row.category.id).toBe(category.id);
  });
});
