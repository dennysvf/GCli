import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { EntriesPage } from "../finance-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("cash.ui.revenuesTitle") };
}

// Financeiro > Receitas (PRD F11): revenue that does not come from patients.
export default async function RevenuesPage() {
  const t = await getTranslations();
  return (
    <div className="grid gap-6">
      <PageHeader title={t("cash.ui.revenuesTitle")} meta={t("cash.ui.revenuesHint")} />
      <EntriesPage kind="REVENUE" />
    </div>
  );
}
