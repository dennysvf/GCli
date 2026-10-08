import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { documents } from "@/modules/documents";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { auditEvents, closeHelpers, createUser, resetDatabase, signedInContext } from "../helpers";
import { appointmentFor } from "../clinical-records/support";
import { documentsWorld, insertCategory, insertDocument, type DocumentsWorld } from "./support";
import { categoriesOf, pdfFile, uploadDocument } from "./uploads";

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

async function uploaded(ctx: DocumentsWorld["desk"], categoryId: string, name = "rg.pdf") {
  const result = await uploadDocument(ctx, {
    patientId: world.patients.maria,
    categoryId,
    file: pdfFile(name),
  });
  if (!result.result.ok) throw new Error(`upload failed: ${result.result.error.code}`);
  return result.result.value.documentId;
}

const list = (ctx: DocumentsWorld["desk"], extra: Record<string, unknown> = {}) =>
  documents.listPatientDocuments(ctx, { patientId: world.patients.maria, ...extra });

describe("listing, archiving and corrections", () => {
  it("F08: archived documents are hidden by default and shown with Mostrar arquivados", async () => {
    const id = await uploaded(world.desk, plainId);
    const archived = await documents.archiveDocument(world.manager, {
      documentId: id,
      reason: "Enviado no paciente errado",
      version: 1,
    });
    expect(archived.ok).toBe(true);
    const hidden = await list(world.desk);
    expect(hidden.ok && hidden.value.items).toHaveLength(0);
    const shown = await list(world.desk, { includeArchived: true });
    expect(shown.ok && shown.value.items[0]).toMatchObject({
      id,
      archived: { reason: "Enviado no paciente errado" },
      canRestore: false,
    });
    const restored = await documents.restoreDocument(world.manager, { documentId: id, version: 2 });
    expect(restored.ok).toBe(true);
    const back = await list(world.desk);
    expect(back.ok && back.value.items.map((item) => item.id)).toEqual([id]);
    const row = await db().patientDocument.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ archivedAt: null, archiveReason: null, version: 3 });
    const actions = (await auditEvents({ entityId: id })).map((event) => event.summary);
    expect(actions).toContain("Documento do paciente arquivado");
    expect(actions).toContain("Documento do paciente restaurado");
  });

  it("F08: archiving needs a reason and a manager, and cannot repeat", async () => {
    const id = await uploaded(world.desk, plainId);
    const forbidden = await documents.archiveDocument(world.desk, {
      documentId: id,
      reason: "Erro de envio",
      version: 1,
    });
    expect(!forbidden.ok && forbidden.error.code).toBe("AUTHZ_FORBIDDEN");
    const noReason = await documents.archiveDocument(world.manager, {
      documentId: id,
      reason: "  ",
      version: 1,
    });
    expect(!noReason.ok && noReason.error.code).toBe("VALIDATION_FAILED");
    const short = await documents.archiveDocument(world.manager, {
      documentId: id,
      reason: "ab",
      version: 1,
    });
    expect(!short.ok && short.error.code).toBe("VALIDATION_FAILED");
    expect(
      (await documents.archiveDocument(world.admin, { documentId: id, reason: "Erro de envio", version: 1 }))
        .ok,
    ).toBe(true);
    const again = await documents.archiveDocument(world.manager, {
      documentId: id,
      reason: "Erro de envio",
      version: 2,
    });
    expect(!again.ok && again.error.code).toBe("DOCUMENT_ALREADY_ARCHIVED");
    const notArchived = await documents.restoreDocument(world.manager, {
      documentId: await uploaded(world.desk, plainId),
      version: 1,
    });
    expect(!notArchived.ok && notArchived.error.code).toBe("DOCUMENT_NOT_ARCHIVED");
    const stale = await documents.restoreDocument(world.manager, { documentId: id, version: 1 });
    expect(!stale.ok && stale.error.code).toBe("DOCUMENT_STALE");
  });

  it("F08: the list is paged, newest first, with filters by category and type", async () => {
    const other = await insertCategory(world, { name: "Receitas" });
    for (let index = 0; index < 55; index += 1) {
      await insertDocument(world, {
        categoryId: index % 5 === 0 ? other.id : plainId,
        title: `Documento ${index}`,
        authorUserId: world.desk.user.id,
      });
    }
    const first = await list(world.desk);
    if (!first.ok) throw new Error("list failed");
    expect(first.value.items).toHaveLength(50);
    expect(first.value.nextCursor).not.toBeNull();
    const second = await list(world.desk, { cursor: first.value.nextCursor });
    if (!second.ok) throw new Error("list failed");
    expect(second.value.items).toHaveLength(5);
    expect(second.value.nextCursor).toBeNull();
    const ids = new Set([...first.value.items, ...second.value.items].map((item) => item.id));
    expect(ids.size).toBe(55);
    const filtered = await list(world.desk, { categoryId: other.id });
    expect(filtered.ok && filtered.value.items).toHaveLength(11);
    const generated = await list(world.desk, { kind: "GENERATED" });
    expect(generated.ok && generated.value.items).toHaveLength(0);
  });

  it("F08: an uploaded document is corrected by its uploader or a manager, and a generated one is not editable", async () => {
    const id = await uploaded(world.desk, plainId);
    const other = await insertCategory(world, { name: "Receitas" });
    const edited = await documents.updateDocument(world.desk, {
      documentId: id,
      title: "RG da paciente",
      categoryId: other.id,
      version: 1,
    });
    expect(edited.ok && edited.value).toEqual({ version: 2, clinical: false });
    // Another front desk user did not upload it and is not a manager.
    const otherDeskUser = await createUser({
      organizationId: world.organizationId,
      role: "FRONT_DESK",
      name: "Outra Recepção",
    });
    const otherDesk = (await signedInContext(otherDeskUser)).ctx;
    const denied = await documents.updateDocument(otherDesk, {
      documentId: id,
      title: "Outro",
      categoryId: other.id,
      version: 2,
    });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
    const byManager = await documents.updateDocument(world.manager, {
      documentId: id,
      title: "Outro",
      categoryId: plainId,
      version: 2,
    });
    expect(byManager.ok).toBe(true);
    const stale = await documents.updateDocument(world.desk, {
      documentId: id,
      title: "Velho",
      categoryId: plainId,
      version: 1,
    });
    expect(!stale.ok && stale.error.code).toBe("DOCUMENT_STALE");

    const issued = (await categoriesOf(world.manager)).all.find((item) => item.system);
    const template = await db().documentTemplate.create({
      data: {
        id: newId(),
        organizationId: world.organizationId,
        name: "Atestado",
        type: "CERTIFICATE",
        bodyHtml: "<p>x</p>",
        bodyText: "x",
      },
    });
    const generatedDoc = await insertDocument(world, {
      categoryId: issued?.id ?? "",
      kind: "GENERATED",
      templateId: template.id,
      professionalId: world.professionals.ana,
      unitId: world.unitId,
    });
    const readOnly = await documents.updateDocument(world.manager, {
      documentId: generatedDoc.id,
      title: "Novo",
      categoryId: plainId,
      version: 1,
    });
    expect(!readOnly.ok && readOnly.error.code).toBe("DOCUMENT_GENERATED_READ_ONLY");
    // The audit of a correction keeps the title out as text.
    const changes = (await auditEvents({ entityId: id })).find(
      (event) => event.summary === "Documento do paciente corrigido",
    );
    expect(JSON.stringify(changes?.changes)).not.toContain("RG da paciente");
  });

  it("F08: moving a clinical document to a non-clinical category keeps it clinical", async () => {
    // The professional uploads it (only they, and managers, may correct a document) and has the appointment.
    await appointmentFor(world);
    const id = await uploaded(world.pro, clinicalId);
    const moved = await documents.updateDocument(world.pro, {
      documentId: id,
      title: "Hemograma",
      categoryId: plainId,
      version: 1,
    });
    expect(moved.ok && moved.value.clinical).toBe(true);
    expect((await db().patientDocument.findUniqueOrThrow({ where: { id } })).isClinical).toBe(true);
    const deskView = await list(world.desk);
    expect(deskView.ok && deskView.value.items).toHaveLength(0);
  });
});

describe("categories", () => {
  it("F08: default categories are created once, in the organization's language", async () => {
    await resetDatabase();
    const english = await documentsWorld();
    await db().organization.update({ where: { id: english.organizationId }, data: { defaultLocale: "en" } });
    // Three first uses at once create one set.
    const results = await Promise.all([1, 2, 3].map(() => documents.listCategories(english.desk, {})));
    expect(results.every((result) => result.ok)).toBe(true);
    const rows = await db().documentCategory.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((row) => row.name)).toEqual([
      "Exam",
      "Signed form",
      "Personal document",
      "External report",
      "Other",
      "Issued document",
    ]);
    expect(rows.filter((row) => row.isClinical).map((row) => row.systemKey)).toEqual([
      "EXAM",
      "EXTERNAL_REPORT",
    ]);
  });

  it("F08: a category is created, renamed, deactivated and limited by managers", async () => {
    const denied = await documents.createCategory(world.desk, { name: "Nova", clinical: false });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
    const created = await documents.createCategory(world.manager, { name: "Receitas", clinical: true });
    if (!created.ok) throw new Error("create failed");
    const duplicate = await documents.createCategory(world.manager, { name: "RECEITAS", clinical: false });
    expect(!duplicate.ok && duplicate.error.code).toBe("DOCUMENT_CATEGORY_NAME_TAKEN");
    const renamed = await documents.updateCategory(world.manager, {
      categoryId: created.value.categoryId,
      name: "Receitas médicas",
      clinical: true,
      version: 1,
    });
    expect(renamed.ok && renamed.value.version).toBe(2);
    const stale = await documents.updateCategory(world.manager, {
      categoryId: created.value.categoryId,
      name: "Zeta",
      clinical: true,
      version: 1,
    });
    expect(!stale.ok && stale.error.code).toBe("DOCUMENT_STALE");
    const off = await documents.setCategoryActive(world.manager, {
      categoryId: created.value.categoryId,
      active: false,
      version: 2,
    });
    expect(off.ok).toBe(true);
    // Front Desk sees only active categories, and the manager can list the inactive ones too.
    const active = await documents.listCategories(world.desk, { includeInactive: true });
    expect(active.ok && active.value.some((item) => item.name === "Receitas médicas")).toBe(false);
    const all = await documents.listCategories(world.manager, { includeInactive: true });
    expect(all.ok && all.value.some((item) => item.name === "Receitas médicas")).toBe(true);
    // 30 active categories at most.
    for (let index = 0; index < 30; index += 1) {
      const result = await documents.createCategory(world.manager, { name: `Cat ${index}`, clinical: false });
      if (!result.ok) {
        expect(result.error.code).toBe("DOCUMENT_CATEGORY_LIMIT");
        return;
      }
    }
    throw new Error("the limit was never reached");
  });

  it("F08: turning a category clinical makes its documents clinical, turning it off does not", async () => {
    const id = await uploaded(world.desk, plainId);
    const category = (await categoriesOf(world.manager)).plain;
    const on = await documents.updateCategory(world.manager, {
      categoryId: plainId,
      name: category.name,
      clinical: true,
      version: category.version,
    });
    expect(on.ok && on.value.documentsMadeClinical).toBe(1);
    expect((await db().patientDocument.findUniqueOrThrow({ where: { id } })).isClinical).toBe(true);
    const off = await documents.updateCategory(world.manager, {
      categoryId: plainId,
      name: category.name,
      clinical: false,
      version: category.version + 1,
    });
    expect(off.ok && off.value.documentsMadeClinical).toBe(0);
    expect((await db().patientDocument.findUniqueOrThrow({ where: { id } })).isClinical).toBe(true);
    // New uploads follow the category flag as it is now.
    const fresh = await uploaded(world.desk, plainId, "novo.pdf");
    expect((await db().patientDocument.findUniqueOrThrow({ where: { id: fresh } })).isClinical).toBe(false);
    const audited = (await auditEvents()).find(
      (event) => event.summary === "Categoria de documento atualizada",
    );
    expect(audited?.metadata).toMatchObject({ documentsMadeClinical: 1 });
  });

  it("F08: the issued category cannot be changed or chosen for uploads", async () => {
    const issued = (await categoriesOf(world.manager)).all.find((item) => item.system);
    if (!issued) throw new Error("the issued category is missing");
    const renamed = await documents.updateCategory(world.manager, {
      categoryId: issued.id,
      name: "Outro nome",
      clinical: false,
      version: issued.version,
    });
    expect(!renamed.ok && renamed.error.code).toBe("DOCUMENT_CATEGORY_SYSTEM");
    const off = await documents.setCategoryActive(world.manager, {
      categoryId: issued.id,
      active: false,
      version: issued.version,
    });
    expect(!off.ok && off.error.code).toBe("DOCUMENT_CATEGORY_SYSTEM");
    const upload = await uploadDocument(world.desk, {
      patientId: world.patients.maria,
      categoryId: issued.id,
      file: pdfFile(),
    });
    expect(!upload.result.ok && upload.result.error.code).toBe("DOCUMENT_CATEGORY_INVALID");
  });
});
