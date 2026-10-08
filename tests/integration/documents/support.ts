import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { clinicalWorld, type ClinicalWorld } from "../clinical-records/support";

export type DocumentsWorld = ClinicalWorld;

// The same clinic as the clinical records tests: a front desk user, two professionals with their
// users, an administrator and patients. Professional "ana" has appointments with Maria only after
// `appointmentFor` runs, which the clinical access tests do explicitly.
export async function documentsWorld(): Promise<DocumentsWorld> {
  return clinicalWorld();
}

export async function insertCategory(
  world: DocumentsWorld,
  options: { name?: string; isClinical?: boolean; systemKey?: string | null; active?: boolean } = {},
) {
  return db().documentCategory.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      name: options.name ?? `Categoria ${newId().slice(0, 8)}`,
      isClinical: options.isClinical ?? false,
      systemKey: options.systemKey ?? null,
      active: options.active ?? true,
    },
  });
}

// Inserts a document directly (as the runtime role), to test the database rules and to seed state.
export async function insertDocument(
  world: DocumentsWorld,
  options: {
    categoryId: string;
    patientId?: string;
    kind?: "UPLOADED" | "GENERATED";
    isClinical?: boolean;
    title?: string;
    sizeBytes?: number;
    authorUserId?: string;
    templateId?: string | null;
    professionalId?: string | null;
    unitId?: string | null;
  },
) {
  const size = options.sizeBytes ?? 1000;
  return db().patientDocument.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      patientId: options.patientId ?? world.patients.maria,
      kind: options.kind ?? "UPLOADED",
      categoryId: options.categoryId,
      title: options.title ?? "Documento",
      isClinical: options.isClinical ?? false,
      fileName: "documento.pdf",
      sourceContentType: "application/pdf",
      sourceObjectKey: `org/${world.organizationId}/documents/${newId()}`,
      objectKey: `org/${world.organizationId}/documents/${newId()}`,
      contentType: "application/pdf",
      sizeBytes: size,
      storedBytes: size,
      authorUserId: options.authorUserId ?? world.desk.user.id,
      templateId: options.templateId ?? null,
      professionalId: options.professionalId ?? null,
      unitId: options.unitId ?? null,
    },
  });
}
