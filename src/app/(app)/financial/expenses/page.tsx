import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { EntriesPage } from "../finance-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("cash.ui.expensesTitle") };
}

// Financeiro > Despesas (PRD F11).
export default async function ExpensesPage() {
  const t = await getTranslations();
  return (
    <div className="grid gap-6">
      <PageHeader title={t("cash.ui.expensesTitle")} meta={t("cash.ui.expensesHint")} />
      <EntriesPage kind="EXPENSE" />
    </div>
  );
}
