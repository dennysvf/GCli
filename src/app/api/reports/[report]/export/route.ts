import { analytics } from "@/modules/analytics";
import { getRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// CSV (streamed) and PDF export of a report (spec F13 section 5, ADR-038). Authorization, limits
// and the audit event are inside the use case; this route only maps the result to a file response.
export async function GET(request: Request, context: { params: Promise<{ report: string }> }) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const { report } = await context.params;
  const params = new URL(request.url).searchParams;
  const format = params.get("format");
  if (format !== "csv" && format !== "pdf")
    return Response.json({ code: "VALIDATION_FAILED" }, { status: 400 });

  const input = Object.fromEntries([...params].filter(([key]) => key !== "format"));
  const result = await analytics.exportReport(ctx, report, format, input);
  if (!result.ok) {
    const translated = toActionResult(result, ctx.locale, "analytics");
    return Response.json(
      { code: result.error.code, message: translated.ok ? "" : translated.error.message },
      { status: result.error.httpStatus },
    );
  }
  const { body, fileName, contentType, rowCount } = result.value;
  return new Response(body instanceof ReadableStream ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Report-Rows": String(rowCount),
      "Cache-Control": "private, no-store",
    },
  });
}
