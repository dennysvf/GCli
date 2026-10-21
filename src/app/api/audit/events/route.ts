import { audit } from "@/modules/audit";
import { getRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Search of the audit log (spec F15 section 5, decision D5). Authorization and validation are in the
// use case; this route only maps the result to JSON with the error's status.
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const input = Object.fromEntries(new URL(request.url).searchParams);
  const result = await audit.searchEvents(ctx, input);
  if (!result.ok) {
    const translated = toActionResult(result, ctx.locale, "audit");
    return Response.json(translated.ok ? { code: result.error.code } : translated.error, {
      status: result.error.httpStatus,
    });
  }
  return Response.json(result.value, { headers: { "Cache-Control": "private, no-store" } });
}
