import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { REPORT_IDS } from "@/modules/analytics";
import { ReportsIndex } from "@/modules/analytics/client";
import { requirePermission } from "@/modules/identity/next";
import { PageHeader } from "@/shared/ui/app-shell/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("analytics.reports.title") };
}

// Relatórios (PRD F13): the list of the five reports.
export default async function ReportsPage() {
  const t = await getTranslations();
  await requirePermission("report:read");
  return (
    <div className="grid gap-6">
      <PageHeader title={t("analytics.reports.title")} />
      <ReportsIndex reports={REPORT_IDS} />
    </div>
  );
}
