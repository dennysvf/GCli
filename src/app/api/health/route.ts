import { healthReport } from "@/shared/observability/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await healthReport();
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
