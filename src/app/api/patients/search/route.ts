import { getRequestContext } from "@/modules/identity/next";
import { patients } from "@/modules/patients";

// Header patient search (spec F05 section 5): GET so typing can cancel earlier requests.
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const result = await patients.searchPatients(ctx, {
    q: params.get("q") ?? "",
    page: params.get("page") ?? undefined,
    status: params.get("status") ?? undefined,
    limit: params.get("limit") ?? undefined,
  });
  if (!result.ok) return Response.json({ code: result.error.code }, { status: result.error.httpStatus });
  return Response.json(result.value, { headers: { "Cache-Control": "private, no-store" } });
}
