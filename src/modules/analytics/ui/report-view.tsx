"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Alert } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { ReportView as ReportData } from "../application/get-report";
import type { ReportId } from "../application/reports/types";
import type { FilterOption } from "./dashboard-filters";
import { ExportButtons } from "./export-buttons";
import { REPORT_EXTRA_FILTERS, isPeriodPreset, toInput, type ReportFilterState } from "./report-options";
import { ReportFilters } from "./report-filters";
import { ReportSummaries } from "./report-summaries";
import { ReportTable } from "./report-table";

export type ReportAction = (report: string, input: unknown) => Promise<ActionResult<ReportData>>;

function searchOf(report: ReportId, filters: ReportFilterState, page: number): string {
  return new URLSearchParams({ ...toInput(report, filters, page), run: "1" }).toString();
}

// Filters are remembered per user and report for the browser session (PRD F13).
const MEMORY_PREFIX = "gcli:reports:";

function remembered(key: string): Partial<ReportFilterState> | null {
  try {
    const saved = sessionStorage.getItem(MEMORY_PREFIX + key);
    return saved ? (JSON.parse(saved) as Partial<ReportFilterState>) : null;
  } catch {
    return null;
  }
}

function remember(key: string, filters: ReportFilterState) {
  try {
    sessionStorage.setItem(MEMORY_PREFIX + key, JSON.stringify(filters));
  } catch {
    // Private windows can refuse storage; the filters simply are not remembered.
  }
}

// One report (PRD F13): filters, "Gerar", summaries, the paginated table with its totals row and
// the exports. The filters of the last generation live in the URL, so a reload or a link repeats it.
export function ReportView({
  report,
  initial,
  initialError,
  initialFilters,
  hasUrlFilters,
  memoryKey,
  units,
  professionals,
  services,
  reasons,
  action,
}: {
  report: ReportId;
  initial: ReportData | null;
  initialError: string | null;
  initialFilters: ReportFilterState;
  hasUrlFilters: boolean;
  memoryKey: string;
  units: FilterOption[];
  professionals: FilterOption[];
  services: FilterOption[];
  reasons: FilterOption[];
  action: ReportAction;
}) {
  const t = useTranslations("analytics.reports");
  const names = useTranslations("analytics.reports.names");
  const format = useFormatters();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState(initial);
  const [error, setError] = useState(initialError);
  const [filters, setFilters] = useState(initialFilters);
  // The filters that produced the table on screen; the exports use these, not the edited ones.
  const [applied, setApplied] = useState(initialFilters);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (hasUrlFilters) return;
    const saved = remembered(memoryKey);
    if (!saved) return;
    // Restored once after hydration, so the server and client markup match on first render.
    const next = { ...initialFilters };
    for (const name of [
      "period",
      "from",
      "to",
      "unit",
      "professional",
      ...REPORT_EXTRA_FILTERS[report],
    ] as const) {
      const value = saved[name];
      if (typeof value === "string" && (name !== "period" || isPeriodPreset(value))) {
        Object.assign(next, { [name]: value });
      }
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setFilters(next);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function generate(requested: ReportFilterState, page: number) {
    remember(memoryKey, requested);
    router.replace(`${pathname}?${searchOf(report, requested, page)}`, { scroll: false });
    startTransition(async () => {
      const result = await action(report, toInput(report, requested, page));
      if (result.ok) {
        setView(result.data);
        setApplied(requested);
        setError(null);
      } else {
        setError(Object.values(result.error.fields ?? {})[0] ?? result.error.message);
      }
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ReportFilters
          report={report}
          filters={filters}
          units={units}
          professionals={professionals}
          services={services}
          reasons={reasons}
          onChange={setFilters}
        />
        <Button type="button" disabled={pending} onClick={() => generate(filters, 1)}>
          {pending ? t("ui.generating") : t("ui.generate")}
        </Button>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      {view ? (
        <div className="grid gap-6" aria-busy={pending}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <p className="text-muted-foreground text-[0.8125rem]" aria-live="polite">
              {t("ui.generatedAt", { time: format.time(view.generatedAt) })}
            </p>
            <ExportButtons report={report} applied={applied} view={view} />
          </div>
          {view.totals.rowCount === 0 ? (
            <div className="grid gap-1 py-12 text-center">
              <p className="font-semibold">{t("ui.empty")}</p>
              <p className="text-muted-foreground text-[0.8125rem]">{t("ui.emptyHint")}</p>
            </div>
          ) : (
            <>
              <ReportSummaries summaries={view.summaries} />
              <ReportTable
                caption={names(report)}
                columns={view.columns}
                rows={view.rows}
                totals={view.totalsRow}
              />
              {view.pageCount > 1 ? (
                <nav
                  aria-label={t("ui.page", { page: view.page, pageCount: view.pageCount })}
                  className="flex items-center justify-end gap-3"
                >
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || view.page <= 1}
                    onClick={() => generate(applied, view.page - 1)}
                  >
                    {t("ui.previous")}
                  </Button>
                  <span className="text-[0.8125rem]">
                    {t("ui.page", { page: view.page, pageCount: view.pageCount })}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending || view.page >= view.pageCount}
                    onClick={() => generate(applied, view.page + 1)}
                  >
                    {t("ui.next")}
                  </Button>
                </nav>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground py-12 text-center text-[0.8125rem]">{t("ui.notGenerated")}</p>
      )}
    </div>
  );
}
