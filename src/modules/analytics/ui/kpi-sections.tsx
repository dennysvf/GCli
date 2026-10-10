"use client";

import { useTranslations } from "next-intl";
import type { Currency } from "@/shared/kernel/countries/codes";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { CountKpi, DashboardView, MoneyKpi, RateKpi } from "../application/views";
import { KpiCard, KpiValue } from "./kpi-card";

// Money figures are wide ("R$ 61.200,00" at 32 px), so the finance row never goes beyond 3 columns
// (design system 5.17).
const OPERATIONS_GRID = "grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6";
const FINANCE_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3";

// The "Operação" and "Financeiro" rows of indicator cards (PRD F12 Experience, design system 5.17).
export function KpiSections({ view }: { view: DashboardView }) {
  const t = useTranslations("analytics");
  const format = useFormatters();
  const percent = (value: number | null) =>
    value === null
      ? t("ui.noValue")
      : format.number(value, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const count = (id: string, kpi: CountKpi) => (
    <KpiCard key={id} id={id} label={t(`kpis.${id}.label`)} formula={t(`kpis.${id}.formula`)}>
      <KpiValue value={format.number(kpi.value)} change={kpi.change} />
    </KpiCard>
  );
  const rate = (id: string, kpi: RateKpi) => (
    <KpiCard key={id} id={id} label={t(`kpis.${id}.label`)} formula={t(`kpis.${id}.formula`)}>
      <KpiValue value={percent(kpi.value)} change={kpi.value === null ? null : kpi.change} />
    </KpiCard>
  );
  // PRD F16: one line per currency, never summed.
  const money = (id: string, kpi: MoneyKpi) => (
    <KpiCard key={id} id={id} label={t(`kpis.${id}.label`)} formula={t(`kpis.${id}.formula`)}>
      {kpi.lines.length === 0 ? (
        <KpiValue value={t("ui.noValue")} change={null} />
      ) : (
        kpi.lines.map((line, index) => (
          <KpiValue
            key={line.currency}
            primary={index === 0}
            value={format.money({
              amountMinor: BigInt(line.amountMinor),
              currency: line.currency as Currency,
            })}
            change={line.change}
          />
        ))
      )}
    </KpiCard>
  );

  const { operations, finance } = view;
  const operationCards = [
    count("appointments", operations.appointments),
    count("completed", operations.completed),
    rate("occupancy", operations.occupancy),
    rate("cancellationRate", operations.cancellationRate),
    rate("noShowRate", operations.noShowRate),
    count("newPatients", operations.newPatients),
  ];
  const financeCards = [
    money("billed", finance.billed),
    money("received", finance.received),
    money("receivable", finance.receivable),
    money("averageTicket", finance.averageTicket),
    ...(finance.paidExpenses ? [money("paidExpenses", finance.paidExpenses)] : []),
    ...(finance.result ? [money("result", finance.result)] : []),
  ];
  return (
    <div className="grid gap-8">
      <section aria-labelledby="dashboard-operations" className="grid gap-3">
        <h2 id="dashboard-operations" className="section-title">
          {t("ui.operations")}
        </h2>
        <div className={OPERATIONS_GRID}>{operationCards}</div>
      </section>
      <section aria-labelledby="dashboard-finance" className="grid gap-3">
        <h2 id="dashboard-finance" className="section-title">
          {t("ui.finance")}
        </h2>
        <div className={FINANCE_GRID}>{financeCards}</div>
        {view.professionalSelected ? (
          <p className="text-muted-foreground text-[0.8125rem]" data-testid="professional-note">
            {t("ui.professionalNote")}
          </p>
        ) : null}
      </section>
    </div>
  );
}
