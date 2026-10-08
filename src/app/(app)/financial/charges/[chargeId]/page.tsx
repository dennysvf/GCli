import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { billing, ChargeDetailView } from "@/modules/billing";
import { getOrganizationProfile } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { units } from "@/modules/units";
import { can } from "@/shared/authz/permissions";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { billingActions } from "../../billing-actions";

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("billing.ui.chargeTitle") };
}

export default async function ChargePage({ params }: PageProps<"/financial/charges/[chargeId]">) {
  const t = await getTranslations();
  const ctx = await requirePermission("billing:operate");
  const { chargeId } = await params;
  const [detail, profile, unitList, selected] = await Promise.all([
    billing.getCharge(ctx, { chargeId }),
    getOrganizationProfile(ctx),
    units.listUnits(ctx, { activeOnly: true }),
    units.getSelectedUnit(ctx),
  ]);
  if (!detail.ok) notFound();

  const timeZone = selected?.timeZone ?? (profile.ok ? profile.value.timeZone : DEFAULT_TIME_ZONE);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("billing.ui.chargeNumber", { number: detail.value.charge.number })}
        breadcrumb={
          <Link href="/financial/charges" className="underline-offset-4 hover:underline">
            {t("billing.ui.chargesTitle")}
          </Link>
        }
      />
      <ChargeDetailView
        initial={detail.value}
        timeZone={timeZone}
        canApprove={can(ctx, "billing:approve")}
        units={(unitList.ok ? unitList.value : []).map((unit) => ({
          id: unit.id,
          name: unit.name,
          currency: unit.currency,
        }))}
        selectedUnitId={selected?.id ?? null}
        actions={billingActions}
      />
    </div>
  );
}
