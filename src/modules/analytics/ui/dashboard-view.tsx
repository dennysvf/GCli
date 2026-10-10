"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Alert } from "@/shared/ui/components/alert";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { DashboardView as DashboardData } from "../application/views";
import { DashboardFilters, type FilterOption, type FilterState } from "./dashboard-filters";
import { KpiSections } from "./kpi-sections";

export type DashboardAction = (input: unknown) => Promise<ActionResult<DashboardData>>;

function searchOf(filters: FilterState): string {
  const params = new URLSearchParams({ period: filters.period });
  if (filters.period === "CUSTOM") {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  if (filters.unit !== "ALL") params.set("unit", filters.unit);
  if (filters.professional !== "ALL") params.set("professional", filters.professional);
  return params.toString();
}

// Painel (PRD F12): filters, the "Operação" and "Financeiro" indicator rows, the time of the
// figures and the empty state. The filters live in the URL, so a reload or a link keeps the view.
export function DashboardView({
  initial,
  initialError,
  initialFilters,
  units,
  professionals,
  action,
}: {
  initial: DashboardData | null;
  initialError: string | null;
  initialFilters: FilterState;
  units: FilterOption[];
  professionals: FilterOption[];
  action: DashboardAction;
}) {
  const t = useTranslations("analytics.ui");
  const format = useFormatters();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState(initial);
  const [error, setError] = useState(initialError);
  const [filters, setFilters] = useState(initialFilters);
  const [pending, startTransition] = useTransition();

  function run(requested: FilterState) {
    // Switching to "Personalizado" starts from the dates on screen.
    const next =
      requested.period === "CUSTOM" && !requested.from && view
        ? { ...requested, from: view.period.from, to: view.period.to }
        : requested;
    setFilters(next);
    router.replace(`${pathname}?${searchOf(next)}`, { scroll: false });
    startTransition(async () => {
      const result = await action({
        period: next.period,
        ...(next.period === "CUSTOM" ? { from: next.from, to: next.to } : {}),
        unit: next.unit,
        professional: next.professional,
      });
      if (result.ok) {
        setView(result.data);
        setError(null);
      } else {
        setError(Object.values(result.error.fields ?? {})[0] ?? result.error.message);
      }
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DashboardFilters filters={filters} units={units} professionals={professionals} onChange={run} />
        <p
          className="text-muted-foreground text-[0.8125rem]"
          aria-live="polite"
          data-testid="dashboard-freshness"
        >
          {pending
            ? t("updating")
            : view
              ? t("updatedAt", { time: format.time(view.computedAt, view.timeZone) })
              : null}
        </p>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {view ? (
        view.isEmpty ? (
          <div className="grid gap-1 py-12 text-center">
            <p className="font-semibold">{t("empty")}</p>
            <p className="text-muted-foreground text-[0.8125rem]">{t("emptyHint")}</p>
          </div>
        ) : (
          <div aria-busy={pending}>
            <KpiSections view={view} />
          </div>
        )
      ) : null}
    </div>
  );
}
