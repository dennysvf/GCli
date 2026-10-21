import { audit } from "@/modules/audit";
import { getRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Detail of one audit event with its field-level diff (spec F15 section 5).
export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const { eventId } = await context.params;
  const result = await audit.getEvent(ctx, eventId);
  if (!result.ok) {
    const translated = toActionResult(result, ctx.locale, "audit");
    return Response.json(translated.ok ? { code: result.error.code } : translated.error, {
      status: result.error.httpStatus,
    });
  }
  return Response.json(result.value, { headers: { "Cache-Control": "private, no-store" } });
}
