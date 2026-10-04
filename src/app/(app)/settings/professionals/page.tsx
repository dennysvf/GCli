import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/modules/identity/next";
import {
  PROFESSIONAL_STATUSES,
  professionals,
  ProfessionalsFilters,
  ProfessionalsTable,
  type ProfessionalStatusFilter,
} from "@/modules/professionals";
import { can } from "@/shared/authz/permissions";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { Button } from "@/shared/ui/components/button";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("common.professionals") };
}

export default async function ProfessionalsPage({ searchParams }: PageProps<"/settings/professionals">) {
  const t = await getTranslations();
  const ctx = await requirePermission("professional:read");
  // PRD F01 matrix: Professional-role users see only their own profile.
  if (!can(ctx, "professional:read-all")) {
    if (ctx.linkedProfessionalId) redirect(`/settings/professionals/${ctx.linkedProfessionalId}`);
    return (
      <div className="grid gap-6">
        <PageHeader title={t("common.professionals")} />
        <p className="text-muted-foreground">{t("professionals.ui.notLinked")}</p>
      </div>
    );
  }

  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() || undefined : undefined;
  const status: ProfessionalStatusFilter =
    PROFESSIONAL_STATUSES.find((value) => value === params.status) ?? "active";
  const result = await professionals.listProfessionals(ctx, { search, status });
  const items = result.ok ? result.value : [];
  const canManage = can(ctx, "professional:manage");

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("common.professionals")}
        meta={`${items.length} ${items.length === 1 ? t("professionals.ui.professionalSingular") : t("professionals.ui.professionalPlural")}`}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/settings/professionals/new">
                <Plus />
                {t("professionals.ui.newProfessional")}
              </Link>
            </Button>
          ) : null
        }
      />
      <ProfessionalsFilters search={search} status={status} />
      <ProfessionalsTable items={items} search={search} canManage={canManage} />
    </div>
  );
}
