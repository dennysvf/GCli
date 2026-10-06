import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { units } from "@/modules/units";
import { requirePermission } from "@/modules/identity/next";
import { can } from "@/shared/authz/permissions";
import { Stamp } from "@/shared/ui/components/stamp";
import { Button } from "@/shared/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/components/card";
import { LegalBanner } from "@/shared/ui/i18n/legal-banner";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("common.units") };
}

export default async function UnitsPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("setup:read");
  const result = await units.listUnits(ctx);
  const list = result.ok ? result.value : [];
  const canManage = can(ctx, "setup:manage");

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("common.units")}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/settings/units/new">
                <Plus />
                {t("units.ui.newUnit")}
              </Link>
            </Button>
          ) : null
        }
      />
      {/* PRD F16: the Administrator is warned about units in countries whose legal rules are not validated. */}
      {[...new Set(list.filter((unit) => unit.active).map((unit) => unit.country))].some(
        (code) => code !== "BR",
      ) ? (
        <LegalBanner country={list.find((unit) => unit.country !== "BR")?.country ?? "PT"} />
      ) : null}
      {list.length === 0 ? (
        <p className="text-muted-foreground">{t("units.ui.noUnits")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((unit) => (
            <Link key={unit.id} href={`/settings/units/${unit.id}`} className="rounded-xl">
              <Card className="hover:bg-muted h-full transition-colors">
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle>{unit.name}</CardTitle>
                  <Stamp variant={unit.active ? "success" : "neutral"}>
                    {unit.active ? t("common.activeFeminine") : t("common.inactiveFeminine")}
                  </Stamp>
                </CardHeader>
                <CardContent className="text-muted-foreground grid gap-1 text-sm">
                  <span>{unit.city ?? t("units.ui.cityNotInformed")}</span>
                  <span>
                    {unit.activeRoomCount}{" "}
                    {unit.activeRoomCount === 1
                      ? t("units.ui.activeRoomSingular")
                      : t("units.ui.activeRoomPlural")}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
