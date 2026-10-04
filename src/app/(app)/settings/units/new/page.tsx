import Link from "next/link";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import type { Metadata } from "next";
import { getOrganizationProfile } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { UnitForm } from "@/modules/units";
import { createUnitAction } from "../actions";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("units.ui.newUnit") };
}

export default async function NewUnitPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("setup:manage");
  const profile = await getOrganizationProfile(ctx);
  // ADR-019: a new unit starts with the organization's time zone.
  const defaultTimeZone = profile.ok ? profile.value.timeZone : "America/Sao_Paulo";
  const defaultCountry = profile.ok ? profile.value.country : ctx.organizationCountry;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("units.ui.newUnit")}
        breadcrumb={
          <Link href="/settings/units" className="underline-offset-4 hover:underline">
            {t("common.units")}
          </Link>
        }
      />
      <UnitForm defaultCountry={defaultCountry} defaultTimeZone={defaultTimeZone} action={createUnitAction} />
    </div>
  );
}
