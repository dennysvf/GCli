import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { documents } from "@/modules/documents";
import { db } from "@/shared/db/client";
import { objectStorage } from "@/shared/storage/object-storage";
import { cleanupDocumentUploads } from "@/worker/jobs/documents";
import { closeHelpers, resetDatabase } from "../helpers";
import { documentsWorld, type DocumentsWorld } from "./support";
import {
  DOCX_CONTENT_TYPE,
  categoriesOf,
  docmBytes,
  docxBytes,
  jpegBytes,
  pdfFile,
  pngBytes,
  putToUrl,
  uploadDocument,
  zipBytes,
  type TestFile,
} from "./uploads";

beforeEach(resetDatabase);
afterAll(closeHelpers);

const QUOTA = 50 * 1024 * 1024 * 1024;

let world: DocumentsWorld;
let categoryId: string;
beforeEach(async () => {
  world = await documentsWorld();
  const categories = await categoriesOf(world.desk);
  categoryId = categories.plain.id;
});

async function setUsed(bytes: number) {
  await db().documentStorageUsage.upsert({
    where: { organizationId: world.organizationId },
    create: { organizationId: world.organizationId, usedBytes: BigInt(bytes) },
    update: { usedBytes: BigInt(bytes) },
  });
}

async function usedBytes() {
  const row = await db().documentStorageUsage.findUniqueOrThrow({
    where: { organizationId: world.organizationId },
  });
  return Number(row.usedBytes);
}

const upload = (file: TestFile, category = categoryId) =>
  uploadDocument(world.desk, { patientId: world.patients.maria, categoryId: category, file });

describe("document uploads", () => {
  it("F08: uploads PDF, JPG, PNG, HEIC and DOCX up to 20 MB with a category", async () => {
    const heic = new Uint8Array(await readFile(join(__dirname, "../clinical-records/fixtures/sample.heic")));
    const files: TestFile[] = [
      pdfFile("exame.pdf"),
      { name: "foto.jpg", contentType: "image/jpeg", bytes: await jpegBytes() },
      { name: "imagem.png", contentType: "image/png", bytes: await pngBytes() },
      { name: "foto.heic", contentType: "image/heic", bytes: heic },
      { name: "relatorio.docx", contentType: DOCX_CONTENT_TYPE, bytes: docxBytes() },
    ];
    const types: string[] = [];
    for (const file of files) {
      const uploaded = await upload(file);
      expect(uploaded.step).toBe("confirm");
      expect(uploaded.result.ok).toBe(true);
      if (!uploaded.result.ok) return;
      const row = await db().patientDocument.findUniqueOrThrow({
        where: { id: uploaded.result.value.documentId },
      });
      expect(row.categoryId).toBe(categoryId);
      types.push(row.sourceContentType);
    }
    expect(types).toEqual(["application/pdf", "image/jpeg", "image/png", "image/heic", DOCX_CONTENT_TYPE]);
    // The HEIC waits for the worker; everything else is ready.
    expect(await db().patientDocument.count({ where: { status: "PROCESSING" } })).toBe(1);
  });

  it("F08: refuses a file over 20 MB, a ZIP and a ZIP renamed to DOCX, with the file name in the message", async () => {
    const big = await documents.createUploadIntent(world.desk, {
      patientId: world.patients.maria,
      categoryId,
      fileName: "grande.pdf",
      contentType: "application/pdf",
      size: 20 * 1024 * 1024 + 1,
    });
    expect(!big.ok && big.error).toMatchObject({
      code: "DOCUMENT_FILE_UNSUPPORTED",
      params: { fileName: "grande.pdf" },
    });
    const zipIntent = await documents.createUploadIntent(world.desk, {
      patientId: world.patients.maria,
      categoryId,
      fileName: "exame.zip",
      contentType: "application/zip",
      size: 100,
    });
    expect(!zipIntent.ok && zipIntent.error.code).toBe("DOCUMENT_FILE_UNSUPPORTED");

    // A ZIP that claims to be a DOCX, and a macro-enabled document, pass the intent and fail on the bytes.
    for (const [name, bytes] of [
      ["exame.docx", zipBytes()],
      ["macro.docx", docmBytes()],
    ] as const) {
      const uploaded = await upload({ name, contentType: DOCX_CONTENT_TYPE, bytes });
      expect(uploaded.step).toBe("confirm");
      expect(uploaded.result.ok).toBe(false);
      if (uploaded.result.ok) return;
      expect(uploaded.result.error).toMatchObject({
        code: "DOCUMENT_FILE_UNSUPPORTED",
        params: { fileName: name },
      });
    }
    expect(await db().patientDocument.count()).toBe(0);
    // The refused objects are removed from the bucket.
    const intents = await db().patientDocumentUpload.findMany({});
    for (const intent of intents) expect(await objectStorage().head(intent.objectKey)).toBeNull();
  });

  it("F08: a failed file in a batch keeps the uploaded ones, and the failed one can be retried", async () => {
    const ok1 = await upload(pdfFile("um.pdf"));
    // The second file never reaches the bucket (the connection dropped): its confirmation fails.
    const lost = await documents.createUploadIntent(world.desk, {
      patientId: world.patients.maria,
      categoryId,
      fileName: "dois.pdf",
      contentType: "application/pdf",
      size: pdfFile().bytes.length,
    });
    if (!lost.ok) throw new Error("intent failed");
    const failed = await documents.confirmUpload(world.desk, { uploadId: lost.value.uploadId });
    expect(!failed.ok && failed.error.code).toBe("DOCUMENT_UPLOAD_NOT_FOUND");
    const ok3 = await upload(pdfFile("tres.pdf"));
    expect(ok1.result.ok && ok3.result.ok).toBe(true);
    expect(await db().patientDocument.count()).toBe(2);
    // "Tentar novamente" starts again from a new intent.
    const retried = await upload(pdfFile("dois.pdf"));
    expect(retried.result.ok).toBe(true);
    expect(await db().patientDocument.count()).toBe(3);
  });

  it("F08: confirming an upload twice returns the same document and charges the quota once", async () => {
    const first = await upload(pdfFile());
    if (!first.result.ok || first.step !== "confirm") throw new Error("upload failed");
    const second = await documents.confirmUpload(world.desk, { uploadId: first.intent.uploadId });
    expect(second.ok && second.value.documentId).toBe(first.result.value.documentId);
    expect(await db().patientDocument.count()).toBe(1);
    expect(await usedBytes()).toBe(pdfFile().bytes.length);
  });

  it("F08: an inactive category and the issued category cannot receive uploads", async () => {
    const categories = await categoriesOf(world.manager);
    const issued = categories.all.find((item) => item.system);
    await documents.setCategoryActive(world.manager, {
      categoryId,
      active: false,
      version: categories.plain.version,
    });
    for (const id of [categoryId, issued?.id ?? ""]) {
      const uploaded = await upload(pdfFile(), id);
      expect(uploaded.step).toBe("intent");
      expect(!uploaded.result.ok && uploaded.result.error.code).toBe(
        id ? "DOCUMENT_CATEGORY_INVALID" : "VALIDATION_FAILED",
      );
    }
  });
});

describe("storage quota", () => {
  it("F08: upload is blocked when the 50 GB quota is reached", async () => {
    await setUsed(QUOTA - 10);
    const blocked = await upload(pdfFile());
    expect(blocked.step).toBe("intent");
    expect(!blocked.result.ok && blocked.result.error.code).toBe("DOCUMENT_QUOTA_EXCEEDED");

    // Another upload filled the quota between the intent and the confirmation: the lock decides.
    await setUsed(0);
    const intent = await documents.createUploadIntent(world.desk, {
      patientId: world.patients.maria,
      categoryId,
      fileName: "exame.pdf",
      contentType: "application/pdf",
      size: pdfFile().bytes.length,
    });
    if (!intent.ok) throw new Error("intent failed");
    await putToUrl(intent.value.url, pdfFile().bytes, intent.value.headers);
    await setUsed(QUOTA - 10);
    const confirmed = await documents.confirmUpload(world.desk, { uploadId: intent.value.uploadId });
    expect(!confirmed.ok && confirmed.error.code).toBe("DOCUMENT_QUOTA_EXCEEDED");
    const row = await db().patientDocumentUpload.findUniqueOrThrow({ where: { id: intent.value.uploadId } });
    expect(await objectStorage().head(row.objectKey)).toBeNull();
    expect(await db().patientDocument.count()).toBe(0);
  });

  it("F08: an alert appears at 80% of the quota, and administrators get one email per crossing", async () => {
    const size = pdfFile().bytes.length;
    // Just below 80%: this upload moves the usage over the line.
    await setUsed((QUOTA * 80) / 100 - size + 5);
    const before = await documents.getStorageUsage(world.desk);
    expect(before.ok && before.value.level).toBe("ok");
    const crossing = await upload(pdfFile("a.pdf"));
    expect(crossing.result.ok).toBe(true);
    const usage = await documents.getStorageUsage(world.desk);
    expect(usage.ok && usage.value.level).toBe("warning");
    const emails = await db().outboxMessage.findMany({ where: { type: "email.storage-quota-alert" } });
    expect(emails).toHaveLength(1);
    expect(emails[0]?.payload).toMatchObject({ to: expect.stringContaining("@"), percent: 80, quotaGb: 50 });
    // Further uploads above 80% do not send it again.
    await upload(pdfFile("b.pdf"));
    expect(await db().outboxMessage.count({ where: { type: "email.storage-quota-alert" } })).toBe(1);
  });

  it("F08: two confirmations at the quota limit store only one file", async () => {
    const size = pdfFile().bytes.length;
    await setUsed(QUOTA - size);
    // The soft check passes for both intents only when the quota still has room, so they are made first.
    await setUsed(0);
    const intents = await Promise.all(
      [1, 2].map(async (index) => {
        const intent = await documents.createUploadIntent(world.desk, {
          patientId: world.patients.maria,
          categoryId,
          fileName: `exame-${index}.pdf`,
          contentType: "application/pdf",
          size,
        });
        if (!intent.ok) throw new Error("intent failed");
        await putToUrl(intent.value.url, pdfFile().bytes, intent.value.headers);
        return intent.value;
      }),
    );
    await setUsed(QUOTA - size);
    const results = await Promise.all(
      intents.map((intent) => documents.confirmUpload(world.desk, { uploadId: intent.uploadId })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter((result) => !result.ok && result.error.code === "DOCUMENT_QUOTA_EXCEEDED"),
    ).toHaveLength(1);
    expect(await usedBytes()).toBe(QUOTA);
    expect(await db().patientDocument.count()).toBe(1);
  });
});

describe("document processing and cleanup", () => {
  it("F08: HEIC processing is idempotent and counts the converted bytes", async () => {
    const heic = new Uint8Array(await readFile(join(__dirname, "../clinical-records/fixtures/sample.heic")));
    const uploaded = await upload({ name: "foto.heic", contentType: "image/heic", bytes: heic });
    if (!uploaded.result.ok) throw new Error("upload failed");
    const input = { organizationId: world.organizationId, documentId: uploaded.result.value.documentId };
    const first = await documents.processDocumentFile(input);
    expect(first.ok && first.value.processed).toBe(true);
    const second = await documents.processDocumentFile(input);
    expect(second.ok && second.value.processed).toBe(false);
    const row = await db().patientDocument.findUniqueOrThrow({ where: { id: input.documentId } });
    expect(row).toMatchObject({ status: "READY", contentType: "image/jpeg" });
    expect(row.storedBytes).toBeGreaterThan(row.sizeBytes);
    expect(await usedBytes()).toBe(row.storedBytes);
    const converted = await objectStorage().get(row.objectKey ?? "");
    expect(converted?.body.subarray(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it("F08: a document that fails every retry is marked as failed and keeps its original", async () => {
    const heic = new Uint8Array(await readFile(join(__dirname, "../clinical-records/fixtures/sample.heic")));
    const uploaded = await upload({ name: "foto.heic", contentType: "image/heic", bytes: heic });
    if (!uploaded.result.ok) throw new Error("upload failed");
    const input = { organizationId: world.organizationId, documentId: uploaded.result.value.documentId };
    await documents.markDocumentFileFailed(input);
    const row = await db().patientDocument.findUniqueOrThrow({ where: { id: input.documentId } });
    expect(row.status).toBe("FAILED");
    expect(await objectStorage().head(row.sourceObjectKey)).not.toBeNull();
  });

  it("F08: the cleanup job removes expired unconfirmed intents and their objects, and keeps confirmed ones", async () => {
    const confirmed = await upload(pdfFile("ficou.pdf"));
    if (confirmed.step !== "confirm") throw new Error("upload failed");
    const abandoned = await documents.createUploadIntent(world.desk, {
      patientId: world.patients.maria,
      categoryId,
      fileName: "abandonado.pdf",
      contentType: "application/pdf",
      size: pdfFile().bytes.length,
    });
    if (!abandoned.ok) throw new Error("intent failed");
    await putToUrl(abandoned.value.url, pdfFile().bytes, abandoned.value.headers);
    const past = new Date(Date.now() - 60_000);
    await db().patientDocumentUpload.updateMany({ data: { expiresAt: past } });
    const removed = await cleanupDocumentUploads();
    expect(removed).toBe(1);
    const gone = await db().patientDocumentUpload.findUnique({ where: { id: abandoned.value.uploadId } });
    expect(gone).toBeNull();
    const kept = await db().patientDocumentUpload.findUnique({ where: { id: confirmed.intent.uploadId } });
    expect(kept).not.toBeNull();
  });
});
