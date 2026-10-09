import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/modules/identity/next";
import { packages, TemplatesPanel } from "@/modules/packages";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { packagesActions } from "../../packages/package-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("packages.ui.settingsTitle") };
}

// Configurações > Pacotes (PRD F10): the templates and the no-show setting.
export default async function PackagesSettingsPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("setup:manage");
  const [templates, activeServices, activeUnits, noShow] = await Promise.all([
    packages.listTemplates(ctx, { includeInactive: true }),
    services.listActiveServices(ctx),
    units.listUnits(ctx, { activeOnly: true }),
    packages.getNoShowDebit(ctx),
  ]);
  const currencies = [
    ...new Set((activeUnits.ok ? activeUnits.value : []).map((unit) => unit.currency as string)),
  ];

  return (
    <div className="grid gap-8">
      <PageHeader title={t("packages.ui.settingsTitle")} meta={t("packages.ui.settingsHint")} />
      <TemplatesPanel
        templates={templates.ok ? templates.value : []}
        services={(activeServices.ok ? activeServices.value : []).map((service) => ({
          id: service.id,
          name: service.name,
          prices: service.prices,
        }))}
        currencies={currencies}
        noShowDebit={noShow.ok ? noShow.value : false}
        actions={packagesActions}
      />
    </div>
  );
}
