import { documents } from "@/modules/documents";
import { DOCX_CONTENT_TYPE } from "@/shared/kernel/file-types";
import sharp from "sharp";
import type { Ctx } from "../clinical-records/support";

// Browser-side steps of a document upload, as the upload dialog performs them (ADR-031): ask for
// an intent, PUT the file to the presigned URL, then confirm.

export { DOCX_CONTENT_TYPE };

export const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

export async function pngBytes(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width: 320, height: 200, channels: 3, background: { r: 30, g: 80, b: 160 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

export async function jpegBytes(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width: 320, height: 200, channels: 3, background: { r: 160, g: 80, b: 30 } },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buffer);
}

// A stored (uncompressed) ZIP with empty entries: enough for the central directory the server reads.
export function buildZip(names: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBytes = encoder.encode(name);
    const local = new Uint8Array(30 + nameBytes.length);
    local.set([0x50, 0x4b, 0x03, 0x04], 0);
    new DataView(local.buffer).setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    parts.push(local);
    const header = new Uint8Array(46 + nameBytes.length);
    header.set([0x50, 0x4b, 0x01, 0x02], 0);
    const view = new DataView(header.buffer);
    view.setUint16(28, nameBytes.length, true);
    view.setUint32(42, offset, true);
    header.set(nameBytes, 46);
    central.push(header);
    offset += local.length;
  }
  const directorySize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  end.set([0x50, 0x4b, 0x05, 0x06], 0);
  const view = new DataView(end.buffer);
  view.setUint16(8, names.length, true);
  view.setUint16(10, names.length, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const bytes = new Uint8Array(all.reduce((sum, item) => sum + item.length, 0));
  let at = 0;
  for (const item of all) {
    bytes.set(item, at);
    at += item.length;
  }
  return bytes;
}

export const docxBytes = () => buildZip(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
export const docmBytes = () => buildZip(["[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"]);
export const zipBytes = () => buildZip(["exame.pdf"]);

export type TestFile = { name: string; contentType: string; bytes: Uint8Array };
export const pdfFile = (name = "exame.pdf"): TestFile => ({
  name,
  contentType: "application/pdf",
  bytes: PDF_BYTES,
});

export async function putToUrl(url: string, bytes: Uint8Array, headers: Record<string, string>) {
  return fetch(url, { method: "PUT", body: bytes as BodyInit, headers });
}

export async function uploadDocument(
  ctx: Ctx,
  input: { patientId: string; categoryId: string; file: TestFile; title?: string },
) {
  const intent = await documents.createUploadIntent(ctx, {
    patientId: input.patientId,
    categoryId: input.categoryId,
    fileName: input.file.name,
    contentType: input.file.contentType,
    size: input.file.bytes.length,
    ...(input.title ? { title: input.title } : {}),
  });
  if (!intent.ok) return { step: "intent" as const, result: intent };
  const response = await putToUrl(intent.value.url, input.file.bytes, intent.value.headers);
  if (!response.ok) throw new Error(`PUT failed with ${response.status}`);
  return {
    step: "confirm" as const,
    intent: intent.value,
    result: await documents.confirmUpload(ctx, { uploadId: intent.value.uploadId }),
  };
}

// The first category that is not clinical, and a clinical one.
export async function categoriesOf(ctx: Ctx) {
  const listed = await documents.listCategories(ctx, {});
  if (!listed.ok) throw new Error(`listCategories failed: ${listed.error.code}`);
  const plain = listed.value.find((item) => !item.clinical && !item.system);
  const clinical = listed.value.find((item) => item.clinical);
  if (!plain || !clinical) throw new Error("default categories are missing");
  return { all: listed.value, plain, clinical };
}
