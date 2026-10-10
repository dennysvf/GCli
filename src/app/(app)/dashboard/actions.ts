"use server";

import { analytics } from "@/modules/analytics";
import { withRequestContext } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";

// Server Action of the dashboard (spec F12 section 5): re-runs the KPIs for new filters.
export async function getDashboardAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await analytics.getDashboard(ctx, input), ctx.locale, "analytics"),
  );
}
