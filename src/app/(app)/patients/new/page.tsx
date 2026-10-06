import type { Metadata } from "next";
import Link from "next/link";
import { getOrganizationProfile } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { PatientForm, patients } from "@/modules/patients";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { savePatientAction } from "../actions";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("patients.ui.newPatient") };
}

export default async function NewPatientPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("patient:manage");
  const [profile, sources, tags] = await Promise.all([
    getOrganizationProfile(ctx),
    patients.listItems(ctx, "referral-source", { activeOnly: true }),
    patients.listItems(ctx, "tag", { activeOnly: true }),
  ]);
  const today = dateInTimeZone(new Date(), profile.ok ? profile.value.timeZone : "America/Sao_Paulo");

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("patients.ui.newPatient")}
        breadcrumb={
          <Link href="/patients" className="underline-offset-4 hover:underline">
            {t("common.patients")}
          </Link>
        }
      />
      <PatientForm
        defaultCountry={ctx.organizationCountry}
        today={today}
        referralSources={sources.ok ? sources.value : []}
        tags={tags.ok ? tags.value : []}
        actions={{ save: savePatientAction }}
      />
    </div>
  );
}
