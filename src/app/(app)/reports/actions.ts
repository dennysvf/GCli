"use server";

import { analytics } from "@/modules/analytics";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Action of the reports (spec F13 section 5): one page of a report for the given filters.
export async function getReportAction(report: string, input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await analytics.getReport(ctx, report, input), ctx.locale, "analytics"),
  );
}
