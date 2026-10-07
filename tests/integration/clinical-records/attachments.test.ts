import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clinicalRecords } from "@/modules/clinical-records";
import { db } from "@/shared/db/client";
import { objectStorage } from "@/shared/storage/object-storage";
import { cleanupClinicalUploads } from "@/worker/jobs/clinical-records";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { appointmentFor, clinicalWorld, insertNote, type ClinicalWorld } from "./support";
import { PDF_BYTES, pngBytes, putToUrl, uploadAttachment } from "./uploads";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: ClinicalWorld;
let noteId: string;
beforeEach(async () => {
  world = await clinicalWorld();
  const appointmentId = await appointmentFor(world);
  noteId = (await insertNote(world, { appointmentId, status: "DRAFT" })).id;
});

const pdf = (name = "laudo.pdf") => ({ name, contentType: "application/pdf", bytes: PDF_BYTES });

describe("clinical attachments", () => {
  it("F07: a PDF is uploaded directly, confirmed and listed with a 5-minute URL", async () => {
    const uploaded = await uploadAttachment(world.pro, noteId, pdf());
    expect(uploaded.step).toBe("confirm");
    const confirmed = uploaded.result;
    expect(confirmed.ok && confirmed.value.status).toBe("READY");
    if (!confirmed.ok) return;
    const opened = await clinicalRecords.openAttachment(world.pro, {
      attachmentId: confirmed.value.attachmentId,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(new URL(opened.value.url).searchParams.get("X-Amz-Expires")).toBe("300");
    const download = await fetch(opened.value.url);
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(PDF_BYTES);
    const reads = (await auditEvents({ action: "READ_SENSITIVE" })).filter(
      (event) => event.entityType === "clinical_attachment",
    );
    expect(reads).toHaveLength(1);
  });

  it("F07: an expired URL stops working", async () => {
    const uploaded = await uploadAttachment(world.pro, noteId, pdf());
    if (!uploaded.result.ok) throw new Error("upload failed");
    const key = (await db().clinicalAttachment.findFirstOrThrow({})).sourceObjectKey;
    // The same signer with an already elapsed lifetime: the bucket refuses it.
    const url = await objectStorage().presignBrowserGet(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect((await fetch(url)).status).toBe(403);
  });

  it("F07: attachments over 20 MB, unsupported formats or an 11th file are rejected with the specific message", async () => {
    const big = await clinicalRecords.createUploadIntent(world.pro, {
      noteId,
      fileName: "grande.pdf",
      contentType: "application/pdf",
      size: 20 * 1024 * 1024 + 1,
    });
    expect(!big.ok && big.error.code).toBe("CLINICAL_ATTACHMENT_UNSUPPORTED");
    const text = await clinicalRecords.createUploadIntent(world.pro, {
      noteId,
      fileName: "nota.txt",
      contentType: "text/plain",
      size: 10,
    });
    expect(!text.ok && text.error.code).toBe("CLINICAL_ATTACHMENT_UNSUPPORTED");

    for (let index = 0; index < 10; index += 1) {
      const result = await uploadAttachment(world.pro, noteId, pdf(`laudo-${index}.pdf`));
      expect(result.result.ok).toBe(true);
    }
    const eleventh = await uploadAttachment(world.pro, noteId, pdf("onze.pdf"));
    expect(eleventh.step).toBe("intent");
    expect(!eleventh.result.ok && eleventh.result.error.code).toBe("CLINICAL_ATTACHMENT_LIMIT");
    // Marking one as a mistake frees a place.
    const first = await db().clinicalAttachment.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const marked = await clinicalRecords.markAttachmentInError(world.pro, { attachmentId: first.id });
    expect(marked.ok).toBe(true);
    const again = await uploadAttachment(world.pro, noteId, pdf("onze.pdf"));
    expect(again.result.ok).toBe(true);
    // The marked attachment stays in the record, only flagged.
    expect(await db().clinicalAttachment.count({ where: { noteId } })).toBe(11);
  });

  it("F07: an object whose real type does not match is refused at confirmation and deleted", async () => {
    const fake = new TextEncoder().encode("MZ this is not a pdf");
    const uploaded = await uploadAttachment(world.pro, noteId, {
      name: "x.pdf",
      contentType: "application/pdf",
      bytes: fake,
    });
    expect(uploaded.step).toBe("confirm");
    expect(!uploaded.result.ok && uploaded.result.error.code).toBe("CLINICAL_ATTACHMENT_UNSUPPORTED");
    const intent = await db().clinicalAttachmentUpload.findFirstOrThrow({});
    expect(await objectStorage().head(intent.objectKey)).toBeNull();
    expect(await db().clinicalAttachment.count({})).toBe(0);
  });

  it("F07: confirming before the file is uploaded fails, and confirming twice is idempotent", async () => {
    const intent = await clinicalRecords.createUploadIntent(world.pro, {
      noteId,
      fileName: "a.pdf",
      contentType: "application/pdf",
      size: PDF_BYTES.length,
    });
    if (!intent.ok) throw new Error("intent failed");
    const early = await clinicalRecords.confirmAttachment(world.pro, { uploadId: intent.value.uploadId });
    expect(!early.ok && early.error.code).toBe("CLINICAL_UPLOAD_NOT_FOUND");
    const response = await putToUrl(intent.value.url, PDF_BYTES, intent.value.headers);
    expect(response.ok).toBe(true);
    const first = await clinicalRecords.confirmAttachment(world.pro, { uploadId: intent.value.uploadId });
    const second = await clinicalRecords.confirmAttachment(world.pro, { uploadId: intent.value.uploadId });
    expect(first.ok && second.ok && first.value.attachmentId === second.value.attachmentId).toBe(true);
    expect(await db().clinicalAttachment.count({})).toBe(1);
  });

  it("F07: the bucket refuses a body of another size than the one signed", async () => {
    const intent = await clinicalRecords.createUploadIntent(world.pro, {
      noteId,
      fileName: "a.pdf",
      contentType: "application/pdf",
      size: PDF_BYTES.length,
    });
    if (!intent.ok) throw new Error("intent failed");
    const bigger = new Uint8Array(PDF_BYTES.length + 100);
    bigger.set(PDF_BYTES);
    const response = await putToUrl(intent.value.url, bigger, intent.value.headers);
    expect(response.ok).toBe(false);
  });

  it("F07: images are processed into a thumbnail by the worker, idempotently", async () => {
    const uploaded = await uploadAttachment(world.pro, noteId, {
      name: "foto.png",
      contentType: "image/png",
      bytes: await pngBytes(),
    });
    expect(uploaded.result.ok && uploaded.result.value.status).toBe("PROCESSING");
    if (!uploaded.result.ok) return;
    const message = await db().outboxMessage.findFirstOrThrow({
      where: { type: "clinical.attachment-process" },
    });
    expect(message.payload).toMatchObject({ attachmentId: uploaded.result.value.attachmentId });
    const job = { organizationId: world.organizationId, attachmentId: uploaded.result.value.attachmentId };
    const processed = await clinicalRecords.processAttachment(job);
    expect(processed.ok && processed.value.processed).toBe(true);
    const row = await db().clinicalAttachment.findUniqueOrThrow({ where: { id: job.attachmentId } });
    expect(row.status).toBe("READY");
    expect(row.thumbnailKey).toBeTruthy();
    expect(await objectStorage().head(row.thumbnailKey ?? "")).not.toBeNull();
    expect(await objectStorage().head(row.sourceObjectKey)).not.toBeNull();
    const again = await clinicalRecords.processAttachment(job);
    expect(again.ok && again.value.processed).toBe(false);
    const details = await clinicalRecords.getNote(world.pro, noteId);
    expect(details.ok && details.value.attachments[0]?.thumbnailUrl).toContain("X-Amz-Expires=300");
  });

  it("F07: HEIC uploads are converted to JPG with a thumbnail and the original is kept", async () => {
    const heic = new Uint8Array(await readFile(join(__dirname, "fixtures", "sample.heic")));
    const uploaded = await uploadAttachment(world.pro, noteId, {
      name: "foto.heic",
      contentType: "image/heic",
      bytes: heic,
    });
    expect(uploaded.result.ok && uploaded.result.value.contentType).toBe("image/heic");
    if (!uploaded.result.ok) return;
    const job = { organizationId: world.organizationId, attachmentId: uploaded.result.value.attachmentId };
    const processed = await clinicalRecords.processAttachment(job);
    expect(processed.ok && processed.value.processed).toBe(true);
    const row = await db().clinicalAttachment.findUniqueOrThrow({ where: { id: job.attachmentId } });
    expect(row.status).toBe("READY");
    expect(row.contentType).toBe("image/jpeg");
    expect(row.objectKey).not.toBe(row.sourceObjectKey);
    const served = await objectStorage().get(row.objectKey ?? "");
    expect(Array.from(served?.body.slice(0, 3) ?? [])).toEqual([0xff, 0xd8, 0xff]);
    expect(await objectStorage().head(row.thumbnailKey ?? "")).not.toBeNull();
    // The HEIC original stays in the record.
    expect(await objectStorage().head(row.sourceObjectKey)).not.toBeNull();
    const again = await clinicalRecords.processAttachment(job);
    expect(again.ok && again.value.processed).toBe(false);
  });

  it("F07: attachments close when the note locks and are private to the author while a draft", async () => {
    const lockedAppointment = await appointmentFor(world, { startTime: "15:00" });
    const locked = await insertNote(world, {
      appointmentId: lockedAppointment,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    const closed = await clinicalRecords.createUploadIntent(world.pro, {
      noteId: locked.id,
      fileName: "tarde.pdf",
      contentType: "application/pdf",
      size: 100,
    });
    expect(!closed.ok && closed.error.code).toBe("CLINICAL_ATTACHMENTS_CLOSED");

    const uploaded = await uploadAttachment(world.pro, noteId, pdf());
    if (!uploaded.result.ok) throw new Error("upload failed");
    await appointmentFor(world, {
      professionalId: world.professionals.bruno,
      startTime: "14:00",
      status: [],
    });
    const other = await clinicalRecords.openAttachment(world.brunoPro, {
      attachmentId: uploaded.result.value.attachmentId,
    });
    expect(!other.ok && other.error.code).toBe("CLINICAL_NOTE_NOT_FOUND");
    const desk = await clinicalRecords.openAttachment(world.desk, {
      attachmentId: uploaded.result.value.attachmentId,
    });
    expect(!desk.ok && desk.error.code).toBe("AUTHZ_FORBIDDEN");
    const denied = (await auditEvents({ action: "PERMISSION_DENIED" })).length;
    expect(denied).toBeGreaterThanOrEqual(1);
  });

  it("F07: an attachment can be marked in error only by its uploader and within 24 hours", async () => {
    const uploaded = await uploadAttachment(world.pro, noteId, pdf());
    if (!uploaded.result.ok) throw new Error("upload failed");
    const id = uploaded.result.value.attachmentId;
    await appointmentFor(world, {
      professionalId: world.professionals.bruno,
      startTime: "14:00",
      status: [],
    });
    const other = await clinicalRecords.markAttachmentInError(world.brunoPro, { attachmentId: id });
    expect(!other.ok && other.error.code).toBe("CLINICAL_NOT_AUTHOR");
    await db().clinicalAttachment.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const late = await clinicalRecords.markAttachmentInError(world.pro, { attachmentId: id });
    expect(!late.ok && late.error.code).toBe("CLINICAL_ATTACHMENT_ERROR_WINDOW_EXPIRED");
  });

  it("F07: unconfirmed uploads are cleaned up after 24 hours", async () => {
    const stale = await clinicalRecords.createUploadIntent(world.pro, {
      noteId,
      fileName: "a.pdf",
      contentType: "application/pdf",
      size: PDF_BYTES.length,
    });
    if (!stale.ok) throw new Error("intent failed");
    await putToUrl(stale.value.url, PDF_BYTES, stale.value.headers);
    const kept = await uploadAttachment(world.pro, noteId, pdf("kept.pdf"));
    expect(kept.result.ok).toBe(true);
    await db().clinicalAttachmentUpload.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await cleanupClinicalUploads()).toBe(1);
    const remaining = await db().clinicalAttachmentUpload.findMany({});
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.consumedAt).not.toBeNull();
  });
});
