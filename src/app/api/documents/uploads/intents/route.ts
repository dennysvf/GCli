import { documents } from "@/modules/documents";
import { getRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Upload intent of a patient document (spec F08 section 5, ADR-031): the browser then PUTs the file
// straight to the private bucket with the presigned URL returned here, and confirms the upload.
export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ ok: false, error: { code: "AUTH_UNAUTHENTICATED" } }, { status: 401 });
  const input: unknown = await request.json().catch(() => null);
  const result = await documents.createUploadIntent(ctx, input);
  return Response.json(toActionResult(result, ctx.locale, "documents"), {
    status: result.ok ? 201 : result.error.httpStatus,
    headers: { "Cache-Control": "private, no-store" },
  });
}
