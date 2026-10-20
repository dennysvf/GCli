import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { closeHelpers, resetDatabase } from "../helpers";
import { insertCategory, insertDocument } from "../documents/support";
import { privacyWorld, requestOrThrow, type PrivacyWorld } from "./support";

let world: PrivacyWorld;

beforeAll(async () => {
  await resetDatabase();
  world = await privacyWorld();
});
afterAll(closeHelpers);

const DAY = 24 * 60 * 60 * 1000;

async function insertExport(requestId: string, data: Record<string, unknown>) {
  return db().lgpdExport.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      requestId,
      locale: "pt-BR",
      requestedById: world.admin.user.id,
      ...data,
    },
  });
}

describe("privacy schema rules", () => {
  it("F14: lgpd tables refuse deletes from the application role", async () => {
    const requestId = await requestOrThrow(world.admin, { patientId: world.patients.maria, type: "ACCESS" });
    const item = await insertExport(requestId, {});
    await expect(db().$executeRaw`DELETE FROM lgpd_export WHERE id = ${item.id}::uuid`).rejects.toThrow(
      /permission denied/,
    );
    await expect(db().$executeRaw`DELETE FROM lgpd_request WHERE id = ${requestId}::uuid`).rejects.toThrow(
      /permission denied/,
    );
  });

  it("F14: an erased document must be a non-clinical upload", async () => {
    const exam = await insertCategory(world, { name: "Exame", isClinical: true });
    const clinical = await insertDocument(world, { categoryId: exam.id, isClinical: true, title: "Exame" });
    await expect(
      db().patientDocument.update({
        where: { id: clinical.id },
        data: { erasedAt: new Date(), erasedById: world.admin.user.id },
      }),
    ).rejects.toThrow(/ck_patient_document_erasable/);
    const personal = await insertCategory(world, { name: "Pessoal" });
    const upload = await insertDocument(world, { categoryId: personal.id, title: "RG" });
    // The erasure always names who made it.
    await expect(
      db().patientDocument.update({ where: { id: upload.id }, data: { erasedAt: new Date() } }),
    ).rejects.toThrow(/ck_patient_document_erased_by/);
    await db().patientDocument.update({
      where: { id: upload.id },
      data: { erasedAt: new Date(), erasedById: world.admin.user.id },
    });
  });

  it("F14: a ready export always has a key and a 7-day expiry", async () => {
    const requestId = await requestOrThrow(world.admin, { patientId: world.patients.joao, type: "ACCESS" });
    const readyAt = new Date();
    await expect(
      insertExport(requestId, { status: "READY", readyAt, expiresAt: new Date(readyAt.getTime() + 7 * DAY) }),
    ).rejects.toThrow(/ck_lgpd_export_ready/);
    await expect(
      insertExport(requestId, {
        status: "READY",
        objectKey: "org/x/privacy/y.zip",
        readyAt,
        expiresAt: new Date(readyAt.getTime() + 8 * DAY),
      }),
    ).rejects.toThrow(/ck_lgpd_export_expiry/);
    await expect(insertExport(requestId, { status: "FAILED" })).rejects.toThrow(/ck_lgpd_export_failed/);
    const ready = await insertExport(requestId, {
      status: "READY",
      objectKey: "org/x/privacy/y.zip",
      readyAt,
      expiresAt: new Date(readyAt.getTime() + 7 * DAY),
    });
    expect(ready.status).toBe("READY");
  });

  it("F14: a request is completed exactly when it is closed, and legal retention only answers anonymization", async () => {
    const requestId = await requestOrThrow(world.admin, {
      patientId: world.patients.maria,
      type: "CORRECTION",
    });
    await expect(
      db().lgpdRequest.update({ where: { id: requestId }, data: { status: "COMPLETED" } }),
    ).rejects.toThrow(/ck_lgpd_request_completion/);
    await expect(
      db().lgpdRequest.update({
        where: { id: requestId },
        data: { status: "LEGAL_RETENTION", completedAt: new Date() },
      }),
    ).rejects.toThrow(/ck_lgpd_request_retention_type/);
  });
});
