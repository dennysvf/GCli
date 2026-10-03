import { getRequestContext } from "@/modules/identity/next";
import { scheduling } from "@/modules/scheduling";

// Printable daily agenda of one professional (PRD F06 Full Scope, ADR-024).
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const result = await scheduling.exportDailyAgenda(ctx, {
    unitId: params.get("unitId") ?? "",
    date: params.get("date") ?? "",
    professionalId: params.get("professionalId") ?? "",
  });
  if (!result.ok) return Response.json({ code: result.error.code }, { status: result.error.httpStatus });
  return new Response(new Uint8Array(result.value.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.value.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
