import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { billing, ChargesList } from "@/modules/billing";
import { getOrganizationProfile } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { professionals } from "@/modules/professionals";
import { units } from "@/modules/units";
import { countryProfile } from "@/shared/kernel/countries";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { billingActions } from "../billing-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("billing.ui.chargesTitle") };
}

// Financeiro > Cobranças (PRD F09): the charges of today in the selected unit's zone, with filters
// and the totals at the bottom.
export default async function ChargesPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("billing:operate");
  const [profile, unitList, professionalList, selected] = await Promise.all([
    getOrganizationProfile(ctx),
    units.listUnits(ctx, { activeOnly: true }),
    professionals.getProfessionals(ctx, { activeOnly: true }),
    units.getSelectedUnit(ctx),
  ]);
  const timeZone = selected?.timeZone ?? (profile.ok ? profile.value.timeZone : "America/Sao_Paulo");
  const today = dateInTimeZone(new Date(), timeZone);
  const list = await billing.listCharges(ctx, { from: today, to: today });
  const activeUnits = unitList.ok ? unitList.value : [];
  const countries = [...new Set([ctx.organizationCountry, ...activeUnits.map((unit) => unit.country)])];
  const methods = [...new Set(countries.flatMap((country) => [...countryProfile(country).paymentMethods]))];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("billing.ui.chargesTitle")} meta={t("billing.ui.chargesHint")} />
      <ChargesList
        initial={list.ok ? list.value : { items: [], nextCursor: null, totals: [] }}
        initialFilters={{ from: today, to: today }}
        units={activeUnits.map((unit) => ({ id: unit.id, name: unit.name }))}
        professionals={(professionalList.ok ? professionalList.value : []).map((item) => ({
          id: item.id,
          name: item.displayName,
        }))}
        methods={methods}
        timeZone={timeZone}
        actions={billingActions}
      />
    </div>
  );
}
