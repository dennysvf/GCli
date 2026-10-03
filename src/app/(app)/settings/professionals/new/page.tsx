import type { Metadata } from "next";
import Link from "next/link";
import { listLinkableUsers } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { ProfessionalForm, professionals } from "@/modules/professionals";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { saveProfessionalAction } from "../actions";
import { ROLE_LABELS } from "../role-labels";

export const metadata: Metadata = { title: "Novo profissional" };

export default async function NewProfessionalPage() {
  const ctx = await requirePermission("professional:manage");
  const [color, users] = await Promise.all([
    professionals.suggestProfessionalColor(ctx),
    listLinkableUsers(ctx),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Novo profissional"
        breadcrumb={
          <Link href="/settings/professionals" className="underline-offset-4 hover:underline">
            Profissionais
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
          roleLabel: ROLE_LABELS[user.role] ?? user.role,
        }))}
        action={saveProfessionalAction}
      />
    </div>
  );
}
