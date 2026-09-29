import { redirect } from "next/navigation";
import { homeFor } from "@/modules/identity";
import { requireRequestContext } from "@/modules/identity/next";

// PRD F01: administrators and managers land on the dashboard; front desk and professionals on
// the agenda.
export default async function HomePage() {
  const ctx = await requireRequestContext();
  redirect(homeFor(ctx.user.role));
}
