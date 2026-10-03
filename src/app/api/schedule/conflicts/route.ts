import { getRequestContext } from "@/modules/identity/next";
import { scheduling } from "@/modules/scheduling";

// Advisory conflict preview for the booking panel; saving checks everything again.
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const value = (name: string) => params.get(name) || undefined;
  const result = await scheduling.previewConflicts(ctx, {
    appointmentId: value("appointmentId"),
    patientId: value("patientId"),
    serviceId: value("serviceId"),
    professionalId: value("professionalId"),
    unitId: value("unitId"),
    roomId: value("roomId") ?? null,
    date: value("date"),
    startTime: value("startTime"),
    durationMinutes: value("durationMinutes"),
  });
  if (!result.ok) return Response.json({ code: result.error.code }, { status: result.error.httpStatus });
  return Response.json(result.value, { headers: { "Cache-Control": "private, no-store" } });
}
