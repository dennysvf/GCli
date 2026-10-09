import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { billing, PaymentMethodsPanel } from "@/modules/billing";
import { cash, CategoriesPanel } from "@/modules/cash";
import { requirePermission } from "@/modules/identity/next";
import { can } from "@/shared/authz/permissions";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { billingActions } from "../../financial/billing-actions";
import { financeActions } from "../../financial/finance-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("billing.ui.settingsTitle") };
}

export default async function BillingSettingsPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("setup:manage");
  const settings = await billing.listPaymentMethodSettings(ctx);
  // PRD F11: the financial categories live next to the payment methods.
  const categories = can(ctx, "finance:manage") ? await cash.listCategories(ctx) : null;
  return (
    <div className="grid gap-8">
      <PageHeader title={t("billing.ui.settingsTitle")} meta={t("billing.ui.settingsHint")} />
      <PaymentMethodsPanel initial={settings.ok ? settings.value : []} actions={billingActions} />
      {categories?.ok ? <CategoriesPanel categories={categories.value} actions={financeActions} /> : null}
    </div>
  );
}
