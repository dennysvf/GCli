import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { analytics, isReportId } from "@/modules/analytics";
import { ReportView } from "@/modules/analytics/client";
import { defaultFilters, isPeriodPreset, type ReportFilterState } from "@/modules/analytics/client";
import { requirePermission } from "@/modules/identity/next";
import { professionals } from "@/modules/professionals";
import { scheduling } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { toActionResult } from "@/shared/kernel/action-result";
import { isValidDate } from "@/shared/kernel/calendar-date";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { getReportAction } from "../actions";

export async function generateMetadata({ params }: PageProps<"/reports/[report]">): Promise<Metadata> {
  const t = await getTranslations();
  const { report } = await params;
  return {
    title: isReportId(report) ? t(`analytics.reports.names.${report}`) : t("analytics.reports.title"),
  };
}

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
const FILTER_NAMES = [
  "unit",
  "professional",
  "service",
  "status",
  "type",
  "origin",
  "reason",
  "groupBy",
  "method",
  "bucket",
] as const;

// A report (PRD F13): reads the filters from the URL and, with run=1, generates the first page on
// the server, so a reload or a link repeats the same result.
export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[report]">) {
  const { report } = await params;
  if (!isReportId(report)) notFound();
  const t = await getTranslations();
  const ctx = await requirePermission("report:read");
  const query = await searchParams;

  const [unitList, selected, professionalList, serviceList, reasonList] = await Promise.all([
    units.listUnits(ctx, { activeOnly: false }),
    units.getSelectedUnit(ctx),
    professionals.listProfessionals(ctx, { status: "all" }),
    services.listServices(ctx, { status: "all" }),
    scheduling.listCancellationReasons(ctx),
  ]);
  const allUnits = unitList.ok ? unitList.value : [];
  const today = dateInTimeZone(new Date(), selected?.timeZone ?? allUnits[0]?.timeZone ?? "UTC");

  const filters: ReportFilterState = defaultFilters(today, report);
  const hasUrlFilters = text(query.run) === "1" || text(query.period) !== "";
  if (hasUrlFilters) {
    const period = text(query.period);
    if (isPeriodPreset(period)) filters.period = period;
    if (isValidDate(text(query.from))) filters.from = text(query.from);
    if (isValidDate(text(query.to))) filters.to = text(query.to);
    for (const name of FILTER_NAMES) if (text(query[name])) filters[name] = text(query[name]);
  }
  const page = Number(text(query.page)) || 1;

  const custom = filters.period === "CUSTOM";
  const result =
    text(query.run) === "1"
      ? toActionResult(
          await analytics.getReport(ctx, report, {
            period: filters.period,
            ...(custom ? { from: filters.from, to: filters.to } : {}),
            unit: filters.unit,
            professional: filters.professional,
            service: filters.service,
            status: filters.status,
            type: filters.type,
            origin: filters.origin,
            reason: filters.reason,
            groupBy: filters.groupBy,
            method: filters.method,
            bucket: filters.bucket,
            page,
          }),
          ctx.locale,
          "analytics",
        )
      : null;

  const options = (items: { id: string; name: string; active: boolean }[]) =>
    items.map((item) => ({ id: item.id, name: item.name, active: item.active }));

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t(`analytics.reports.names.${report}`)}
        breadcrumb={<Link href="/reports">{t("analytics.reports.ui.back")}</Link>}
      />
      <ReportView
        report={report}
        initial={result?.ok ? result.data : null}
        initialError={result && !result.ok ? result.error.message : null}
        initialFilters={filters}
        hasUrlFilters={hasUrlFilters}
        memoryKey={`${ctx.user.id}:${report}`}
        units={options(allUnits)}
        professionals={(professionalList.ok ? professionalList.value : []).map((professional) => ({
          id: professional.id,
          name: professional.displayName,
          active: professional.active,
        }))}
        services={options(
          (serviceList.ok ? serviceList.value.groups : []).flatMap((group) => group.services),
        )}
        reasons={options(reasonList.ok ? reasonList.value : [])}
        action={getReportAction}
      />
    </div>
  );
}
