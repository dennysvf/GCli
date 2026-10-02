import { getRequestContext } from "@/modules/identity/next";
import { scheduling } from "@/modules/scheduling";

// "Próximo horário livre" (PRD F06): up to 10 free slots within 60 days.
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const result = await scheduling.findNextAvailableSlots(ctx, {
    unitId: params.get("unitId") ?? "",
    serviceId: params.get("serviceId") ?? "",
    professionalId: params.get("professionalId") || undefined,
    durationMinutes: params.get("durationMinutes") || undefined,
  });
  if (!result.ok) return Response.json({ code: result.error.code }, { status: result.error.httpStatus });
  return Response.json(result.value, { headers: { "Cache-Control": "private, no-store" } });
}
