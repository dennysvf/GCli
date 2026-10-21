import { audit } from "@/modules/audit";
import { getRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// CSV export of the audit log (spec F15 section 5, decision D8). The limit and the EXPORT event are
// inside the use case; this route only maps the result to a streamed file response.
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const input = Object.fromEntries(new URL(request.url).searchParams);
  const result = await audit.exportEvents(ctx, input);
  if (!result.ok) {
    const translated = toActionResult(result, ctx.locale, "audit");
    return Response.json(translated.ok ? { code: result.error.code } : translated.error, {
      status: result.error.httpStatus,
    });
  }
  const { body, fileName, contentType, rowCount } = result.value;
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Report-Rows": String(rowCount),
      "Cache-Control": "private, no-store",
    },
  });
}
