import sharp from "sharp";
import { clinicalRecords } from "@/modules/clinical-records";
import type { Ctx } from "./support";

// Browser-side steps of an attachment upload, as the record page performs them (ADR-031): ask for
// an intent, PUT the file to the presigned URL, then confirm.

export const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

export async function pngBytes(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 30, g: 80, b: 160 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

export async function putToUrl(url: string, bytes: Uint8Array, headers: Record<string, string>) {
  return fetch(url, { method: "PUT", body: bytes as BodyInit, headers });
}

export async function uploadAttachment(
  ctx: Ctx,
  noteId: string,
  file: { name: string; contentType: string; bytes: Uint8Array },
) {
  const intent = await clinicalRecords.createUploadIntent(ctx, {
    noteId,
    fileName: file.name,
    contentType: file.contentType,
    size: file.bytes.length,
  });
  if (!intent.ok) return { step: "intent" as const, result: intent };
  const response = await putToUrl(intent.value.url, file.bytes, intent.value.headers);
  if (!response.ok) throw new Error(`PUT failed with ${response.status}`);
  return {
    step: "confirm" as const,
    intent: intent.value,
    result: await clinicalRecords.confirmAttachment(ctx, { uploadId: intent.value.uploadId }),
  };
}
