import Link from "next/link";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import type { Metadata } from "next";
import { getOrganizationProfile } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { UnitForm } from "@/modules/units";
import { createUnitAction } from "../actions";

export const metadata: Metadata = { title: "Nova unidade" };

export default async function NewUnitPage() {
  const ctx = await requirePermission("setup:manage");
  const profile = await getOrganizationProfile(ctx);
  // ADR-019: a new unit starts with the organization's time zone.
  const defaultTimeZone = profile.ok ? profile.value.timeZone : "America/Sao_Paulo";

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Nova unidade"
        breadcrumb={
          <Link href="/settings/units" className="underline-offset-4 hover:underline">
            Unidades
          </Link>
        }
      />
      <UnitForm defaultTimeZone={defaultTimeZone} action={createUnitAction} />
    </div>
  );
}
