import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { audit, AUDIT_DEFAULT_PERIOD_DAYS, AUDIT_MAX_PERIOD_DAYS } from "@/modules/audit";
import { AuditLogView, type AuditFilterState, type AuditLoadError } from "@/modules/audit/client";
import { requirePermission } from "@/modules/identity/next";
import { toActionResult } from "@/shared/kernel/action-result";
import { addDays } from "@/shared/kernel/calendar-date";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("audit.title") };
}

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value.trim() : "");

function inputOf(filters: AuditFilterState): Record<string, string> {
  return {
    from: filters.from,
    to: filters.to,
    user: filters.user,
    action: filters.action,
    entityType: filters.entityType,
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
  };
}

// Configurações > Auditoria (PRD F15): the filters come from the URL and the first page is rendered
// on the server; filter changes and pages are then read from /api/audit/events by the view.
export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const t = await getTranslations();
  const ctx = await requirePermission("audit:read");
  const query = await searchParams;

  const options = await audit.listFilterOptions(ctx);
  const filterOptions = options.ok
    ? options.value
    : {
        users: [],
        actions: [],
        entityTypeGroups: [],
        timeZone: "America/Sao_Paulo",
        today: dateInTimeZone(new Date(), "America/Sao_Paulo"),
      };
  const today = filterOptions.today;
  const defaults: AuditFilterState = {
    from: addDays(today, -(AUDIT_DEFAULT_PERIOD_DAYS - 1)),
    to: today,
    user: "ALL",
    action: "ALL",
    entityType: "ALL",
    entityId: "",
  };
  // Spec F15 decision D4: a "Ver auditoria" link (an entity without dates) opens the last 366 days.
  const days =
    text(query.entityId) && !text(query.from) && !text(query.to)
      ? AUDIT_MAX_PERIOD_DAYS
      : AUDIT_DEFAULT_PERIOD_DAYS;
  const to = text(query.to) || today;
  const requested: AuditFilterState = {
    from: text(query.from) || addDays(to, -(days - 1)),
    to,
    user: text(query.user) || "ALL",
    action: text(query.action) || "ALL",
    entityType: text(query.entityType) || "ALL",
    entityId: text(query.entityId),
  };

  let initialFilters = requested;
  let initialError: AuditLoadError | null = null;
  let result = await audit.searchEvents(ctx, inputOf(requested));
  if (!result.ok) {
    // Invalid filters in the URL: the error is shown and the defaults are applied.
    const translated = toActionResult(result, ctx.locale, "audit");
    if (!translated.ok)
      initialError = {
        message: Object.values(translated.error.fields ?? {})[0] ?? translated.error.message,
      };
    initialFilters = defaults;
    result = await audit.searchEvents(ctx, inputOf(defaults));
  }
  const initialPage = result.ok ? result.value : null;
  if (initialPage) initialFilters = { ...initialFilters, ...initialPage.period };

  return (
    <div className="grid gap-6">
      <PageHeader title={t("audit.title")} />
      <AuditLogView
        initialFilters={initialFilters}
        initialPage={initialPage}
        initialError={initialError}
        defaults={defaults}
        options={filterOptions}
      />
    </div>
  );
}
