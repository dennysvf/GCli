import { documents } from "@/modules/documents";
import { getRequestContext } from "@/modules/identity/next";

// Opens one patient document (spec F08 section 5): authorization, the audited read, then a redirect
// to a presigned URL that expires in 5 minutes (PRD F08).
export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const { documentId } = await context.params;
  const params = new URL(request.url).searchParams;
  const result = await documents.openDocument(ctx, {
    documentId,
    variant: params.get("variant") ?? undefined,
    disposition: params.get("disposition") ?? undefined,
  });
  if (!result.ok) return Response.json({ code: result.error.code }, { status: result.error.httpStatus });
  return new Response(null, {
    status: 302,
    headers: { Location: result.value.url, "Cache-Control": "private, no-store" },
  });
}
