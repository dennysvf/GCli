import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ApprovalsTable, billing } from "@/modules/billing";
import { getOrganizationProfile } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { units } from "@/modules/units";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { billingActions } from "../billing-actions";

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("billing.ui.approvalsTitle") };
}

// Financeiro > Aprovações (PRD F09): discounts above 20% waiting for a Manager or Administrator.
export default async function ApprovalsPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("billing:approve");
  const [pending, profile, selected] = await Promise.all([
    billing.listPendingApprovals(ctx),
    getOrganizationProfile(ctx),
    units.getSelectedUnit(ctx),
  ]);
  const timeZone = selected?.timeZone ?? (profile.ok ? profile.value.timeZone : DEFAULT_TIME_ZONE);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("billing.ui.approvalsTitle")} meta={t("billing.ui.approvalsHint")} />
      <ApprovalsTable
        initial={pending.ok ? pending.value : []}
        timeZone={timeZone}
        actions={billingActions}
      />
    </div>
  );
}
