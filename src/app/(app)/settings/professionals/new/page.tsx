import type { Metadata } from "next";
import Link from "next/link";
import { listLinkableUsers } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { ProfessionalForm, professionals } from "@/modules/professionals";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { saveProfessionalAction } from "../actions";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("professionals.ui.newProfessional") };
}

export default async function NewProfessionalPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("professional:manage");
  const [color, users] = await Promise.all([
    professionals.suggestProfessionalColor(ctx),
    listLinkableUsers(ctx),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("professionals.ui.newProfessional")}
        breadcrumb={
          <Link href="/settings/professionals" className="underline-offset-4 hover:underline">
            {t("common.professionals")}
          </Link>
        }
      />
      <ProfessionalForm
        defaultColor={color.ok ? color.value : "blue"}
        defaultCountry={ctx.organizationCountry}
        linkableUsers={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          roleLabel: t(`shell.roles.${user.role}`),
        }))}
        action={saveProfessionalAction}
      />
    </div>
  );
}
