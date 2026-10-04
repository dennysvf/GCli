import type { Metadata } from "next";
import { requirePermission } from "@/modules/identity/next";
import { UnderConstruction } from "@/shared/ui/app-shell/under-construction";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("common.dashboard") };
}

export default async function DashboardPage() {
  const t = await getTranslations();
  await requirePermission("dashboard:read");
  return <UnderConstruction title={t("common.dashboard")} feature="F12" />;
}
