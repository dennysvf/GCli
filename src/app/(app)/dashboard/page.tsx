import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { analytics, PERIOD_PRESETS, type PeriodPreset } from "@/modules/analytics";
import { DashboardView, type FilterState } from "@/modules/analytics/client";
import { requirePermission } from "@/modules/identity/next";
import { professionals } from "@/modules/professionals";
import { units } from "@/modules/units";
import { toActionResult } from "@/shared/kernel/action-result";
import { isValidDate } from "@/shared/kernel/calendar-date";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { getDashboardAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("common.dashboard") };
}

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

// Painel (PRD F12): reads the filters from the URL (spec F12, assumption 9: "Mês atual", all units
// and all professionals by default) and renders the first view on the server.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const t = await getTranslations();
  const ctx = await requirePermission("dashboard:read");
  const params = await searchParams;
  const period = PERIOD_PRESETS.includes(text(params.period) as PeriodPreset)
    ? (text(params.period) as PeriodPreset)
    : "CURRENT_MONTH";
  const filters: FilterState = {
    period,
    from: isValidDate(text(params.from)) ? text(params.from) : "",
    to: isValidDate(text(params.to)) ? text(params.to) : "",
    unit: text(params.unit) || "ALL",
    professional: text(params.professional) || "ALL",
  };
  const custom = period === "CUSTOM" && filters.from && filters.to;
  const [result, unitList, professionalList] = await Promise.all([
    analytics.getDashboard(ctx, {
      period: custom || period !== "CUSTOM" ? period : "CURRENT_MONTH",
      ...(custom ? { from: filters.from, to: filters.to } : {}),
      unit: filters.unit,
      professional: filters.professional,
    }),
    units.listUnits(ctx, { activeOnly: false }),
    professionals.listProfessionals(ctx, { status: "all" }),
  ]);
  const view = toActionResult(result, ctx.locale, "analytics");
  if (view.ok && period === "CUSTOM" && !custom)
    Object.assign(filters, view.data.period, { period: "CURRENT_MONTH" });

  return (
    <div className="grid gap-6">
      <PageHeader title={t("analytics.ui.title")} />
      <DashboardView
        initial={view.ok ? view.data : null}
        initialError={view.ok ? null : view.error.message}
        initialFilters={filters}
        units={(unitList.ok ? unitList.value : []).map((unit) => ({
          id: unit.id,
          name: unit.name,
          active: unit.active,
        }))}
        professionals={(professionalList.ok ? professionalList.value : []).map((professional) => ({
          id: professional.id,
          name: professional.displayName,
          active: professional.active,
        }))}
        action={getDashboardAction}
      />
    </div>
  );
}
