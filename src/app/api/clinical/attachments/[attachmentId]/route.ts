import { clinicalRecords } from "@/modules/clinical-records";
import { getRequestContext } from "@/modules/identity/next";

// Opens one clinical attachment (spec F07 section 5): authorization, the audited read, then a
// redirect to a presigned URL that expires in 5 minutes (PRD F07).
export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const { attachmentId } = await context.params;
  const variant = new URL(request.url).searchParams.get("variant") ?? "converted";
  const result = await clinicalRecords.openAttachment(ctx, { attachmentId, variant });
  if (!result.ok) return Response.json({ code: result.error.code }, { status: result.error.httpStatus });
  return new Response(null, {
    status: 302,
    headers: { Location: result.value.url, "Cache-Control": "private, no-store" },
  });
}
