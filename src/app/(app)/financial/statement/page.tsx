import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cash, StatementView } from "@/modules/cash";
import { requirePermission } from "@/modules/identity/next";
import { units } from "@/modules/units";
import { toActionResult } from "@/shared/kernel/action-result";
import { currencyOf } from "@/shared/kernel/countries/codes";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { financeActions } from "../finance-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("cash.ui.statementTitle") };
}

// Financeiro > Extrato (PRD F11): the current month of the selected unit (or all units), in one
// currency. The filters re-run the statement without leaving the page.
export default async function StatementPage() {
  const t = await getTranslations();
  const ctx = await requirePermission("finance:manage");
  const [unitList, selected] = await Promise.all([
    units.listUnits(ctx, { activeOnly: false }),
    units.getSelectedUnit(ctx),
  ]);
  const allUnits = unitList.ok ? unitList.value : [];
  const timeZone = selected?.timeZone ?? allUnits[0]?.timeZone ?? "UTC";
  const today = dateInTimeZone(new Date(), timeZone);
  const filters = {
    unit: selected?.id ?? "ALL",
    from: `${today.slice(0, 8)}01`,
    to: today,
    currency: null as string | null,
  };
  const result = toActionResult(await cash.getStatement(ctx, filters), ctx.locale, "cash");
  const currencies = [
    ...new Set([
      currencyOf(ctx.organizationCountry) as string,
      ...allUnits.map((unit) => unit.currency as string),
    ]),
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("cash.ui.statementTitle")} meta={t("cash.ui.statementHint")} />
      <StatementView
        initial={result.ok ? result.data : null}
        initialError={result.ok ? null : result.error.message}
        initialFilters={filters}
        units={allUnits.map((unit) => ({ id: unit.id, name: unit.name }))}
        currencies={currencies}
        actions={financeActions}
      />
    </div>
  );
}
