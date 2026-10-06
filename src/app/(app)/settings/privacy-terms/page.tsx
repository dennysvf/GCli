import type { Metadata } from "next";
import { requirePermission } from "@/modules/identity/next";
import { patients, TermsPanel } from "@/modules/patients";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { publishTermsVersionAction } from "./actions";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("patients.ui.privacyTerms") };
}

export default async function PrivacyTermsPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("lgpd:manage");
  const versions = await patients.listTermsVersions(ctx);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("patients.ui.privacyTerms")} meta={t("patients.ui.privacyTermsHint")} />
      <TermsPanel versions={versions.ok ? versions.value : []} action={publishTermsVersionAction} />
    </div>
  );
}
