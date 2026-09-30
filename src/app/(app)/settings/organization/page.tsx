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

export const metadata: Metadata = { title: "Organização" };

export default async function OrganizationSettingsPage() {
  const ctx = await requirePermission("organization:update");
  const profile = await getOrganizationProfile(ctx);
  if (!profile.ok) notFound();

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Configurações da organização</h1>
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
