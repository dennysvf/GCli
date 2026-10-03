import { getRequestContext } from "@/modules/identity/next";
import { scheduling } from "@/modules/scheduling";

// Agenda data and the 30-second polling feed (spec F06 section 5, ADR-025).
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const result = await scheduling.getAgenda(ctx, {
    unitId: params.get("unitId") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    professionalIds: params.get("professionalIds") ?? undefined,
    roomIds: params.get("roomIds") ?? undefined,
    serviceIds: params.get("serviceIds") ?? undefined,
    statuses: params.get("statuses") ?? undefined,
    since: params.get("since") ?? undefined,
  });
  if (!result.ok) return Response.json({ code: result.error.code }, { status: result.error.httpStatus });
  return Response.json(result.value, { headers: { "Cache-Control": "private, no-store" } });
}
