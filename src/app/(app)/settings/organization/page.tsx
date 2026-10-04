import { PageHeader } from "@/shared/ui/app-shell/page-header";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrganizationProfile, LogoUploader, OrganizationForm } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { Separator } from "@/shared/ui/components/separator";
import {
  removeOrganizationLogoAction,
  updateOrganizationAction,
  uploadOrganizationLogoAction,
} from "./actions";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("identity.ui.organization") };
}

export default async function OrganizationSettingsPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("organization:update");
  const profile = await getOrganizationProfile(ctx);
  if (!profile.ok) notFound();

  return (
    <div className="grid gap-6">
      <PageHeader title={t("identity.ui.organizationSettings")} />
      <LogoUploader
        logoUrl={profile.value.logoUrl}
        uploadAction={uploadOrganizationLogoAction}
        removeAction={removeOrganizationLogoAction}
      />
      <Separator />
      <OrganizationForm profile={profile.value} action={updateOrganizationAction} />
    </div>
  );
}
