import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cash, CashRegisterView } from "@/modules/cash";
import { requirePermission } from "@/modules/identity/next";
import { units } from "@/modules/units";
import { can } from "@/shared/authz/permissions";
import { isValidDate } from "@/shared/kernel/calendar-date";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { Alert } from "@/shared/ui/components/alert";
import { cashActions } from "../cash-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("cash.ui.cashTitle") };
}

// Financeiro > Caixa (PRD F11): the day of the unit selected in the header. The date comes from the
// URL; the default is today in the unit time zone.
export default async function CashPage({ searchParams }: PageProps<"/financial/cash">) {
  const t = await getTranslations();
  const ctx = await requirePermission("cash:operate");
  const selected = await units.getSelectedUnit(ctx);
  const header = <PageHeader title={t("cash.ui.cashTitle")} meta={t("cash.ui.cashHint")} />;
  if (!selected) {
    return (
      <div className="grid gap-6">
        {header}
        <Alert>{t("cash.ui.selectUnit")}</Alert>
      </div>
    );
  }

  const params = await searchParams;
  const today = dateInTimeZone(new Date(), selected.timeZone);
  const requested = typeof params.date === "string" && isValidDate(params.date) ? params.date : today;
  const businessDate = requested > today ? today : requested;
  const [day, categories] = await Promise.all([
    cash.getRegisterDay(ctx, { unitId: selected.id, businessDate }),
    cash.listCategories(ctx),
  ]);
  if (!day.ok) {
    return (
      <div className="grid gap-6">
        {header}
        <Alert variant="destructive">{t(`cash.errors.${day.error.code}`, day.error.params ?? {})}</Alert>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {header}
      <CashRegisterView
        day={day.value}
        categories={categories.ok ? categories.value : []}
        canReopen={can(ctx, "cash:reopen")}
        actions={cashActions}
      />
    </div>
  );
}
