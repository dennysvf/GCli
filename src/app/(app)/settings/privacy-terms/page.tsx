import type { Metadata } from "next";
import { requirePermission } from "@/modules/identity/next";
import { patients, TermsPanel } from "@/modules/patients";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { publishTermsVersionAction } from "./actions";

export const metadata: Metadata = { title: "Termos de privacidade" };

export default async function PrivacyTermsPage() {
  const ctx = await requirePermission("lgpd:manage");
  const versions = await patients.listTermsVersions(ctx);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Termos de privacidade"
        meta="Texto apresentado aos pacientes para o consentimento (LGPD)."
      />
      <TermsPanel versions={versions.ok ? versions.value : []} action={publishTermsVersionAction} />
    </div>
  );
}
