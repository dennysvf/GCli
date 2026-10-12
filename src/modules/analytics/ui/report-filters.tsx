"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import type { ReportId } from "../application/reports/types";
import { PERIOD_PRESETS } from "../domain/period";
import type { FilterOption } from "./dashboard-filters";
import {
  BUCKET_OPTIONS,
  CANCELLATION_ORIGIN_OPTIONS,
  CHARGE_ORIGIN_OPTIONS,
  GROUP_BY_OPTIONS,
  METHOD_OPTIONS,
  REPORT_EXTRA_FILTERS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  type ExtraFilter,
  type ReportFilterState,
} from "./report-options";

const ALL = "ALL";

type Choice = { value: string; label: string };

function ChoiceSelect({
  id,
  label,
  value,
  choices,
  onChange,
  width = "min-w-44",
}: {
  id: string;
  label: string;
  value: string;
  choices: Choice[];
  onChange: (value: string) => void;
  width?: string;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className={width}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// The filter bar of a report (PRD F13, design system 5.18): the common filters, then the filters of
// the report. Nothing runs until "Gerar" is pressed.
export function ReportFilters({
  report,
  filters,
  units,
  professionals,
  services,
  reasons,
  onChange,
}: {
  report: ReportId;
  filters: ReportFilterState;
  units: FilterOption[];
  professionals: FilterOption[];
  services: FilterOption[];
  reasons: FilterOption[];
  onChange: (next: ReportFilterState) => void;
}) {
  const t = useTranslations("analytics");
  const set = (patch: Partial<ReportFilterState>) => onChange({ ...filters, ...patch });
  const inactive = (option: FilterOption) =>
    option.active ? option.name : t("reports.filters.inactive", { name: option.name });
  const all = (label: string): Choice => ({ value: ALL, label });

  const extra: Record<ExtraFilter, () => Choice[]> = {
    service: () => [
      all(t("reports.filters.allServices")),
      ...services.map((option) => ({ value: option.id, label: inactive(option) })),
    ],
    status: () => [
      all(t("reports.filters.all")),
      ...STATUS_OPTIONS.map((value) => ({ value, label: t(`reports.values.status.${value}`) })),
    ],
    type: () => [
      all(t("reports.filters.all")),
      ...TYPE_OPTIONS.map((value) => ({ value, label: t(`reports.filters.typeOptions.${value}`) })),
    ],
    origin: () => [
      all(t("reports.filters.all")),
      ...(report === "receivables"
        ? CHARGE_ORIGIN_OPTIONS.map((value) => ({ value, label: t(`reports.values.chargeOrigin.${value}`) }))
        : CANCELLATION_ORIGIN_OPTIONS.map((value) => ({
            value,
            label: t(`reports.values.cancellationOrigin.${value}`),
          }))),
    ],
    reason: () => [
      all(t("reports.filters.allReasons")),
      ...reasons.map((option) => ({ value: option.id, label: inactive(option) })),
    ],
    groupBy: () => GROUP_BY_OPTIONS.map((value) => ({ value, label: t(`reports.groupLabels.${value}`) })),
    method: () => [
      all(t("reports.filters.all")),
      ...METHOD_OPTIONS.map((value) => ({ value, label: t(`reports.values.method.${value}`) })),
    ],
    bucket: () => [
      all(t("reports.filters.all")),
      ...BUCKET_OPTIONS.map((value) => ({ value, label: t(`reports.values.bucket.${value}`) })),
    ],
  };

  return (
    <div role="group" aria-label={t("reports.ui.filters")} className="flex flex-wrap items-end gap-4">
      <ChoiceSelect
        id="report-period"
        label={t("ui.period")}
        value={filters.period}
        choices={PERIOD_PRESETS.map((preset) => ({ value: preset, label: t(`presets.${preset}`) }))}
        onChange={(value) => set({ period: value as ReportFilterState["period"] })}
      />
      {filters.period === "CUSTOM" ? (
        <>
          <div className="grid gap-1">
            <Label htmlFor="report-from">{t("ui.from")}</Label>
            <Input
              id="report-from"
              type="date"
              value={filters.from}
              onChange={(event) => set({ from: event.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="report-to">{t("ui.to")}</Label>
            <Input
              id="report-to"
              type="date"
              value={filters.to}
              onChange={(event) => set({ to: event.target.value })}
            />
          </div>
        </>
      ) : null}
      <ChoiceSelect
        id="report-unit"
        label={t("ui.unit")}
        value={filters.unit}
        choices={[
          all(t("ui.allUnits")),
          ...units.map((unit) => ({
            value: unit.id,
            label: unit.active ? unit.name : t("ui.inactiveUnit", { name: unit.name }),
          })),
        ]}
        onChange={(value) => set({ unit: value })}
      />
      <ChoiceSelect
        id="report-professional"
        label={t("ui.professional")}
        value={filters.professional}
        width="min-w-52"
        choices={[
          all(t("ui.allProfessionals")),
          ...professionals.map((professional) => ({
            value: professional.id,
            label: professional.active
              ? professional.name
              : t("ui.inactiveProfessional", { name: professional.name }),
          })),
        ]}
        onChange={(value) => set({ professional: value })}
      />
      {REPORT_EXTRA_FILTERS[report].map((name) => (
        <ChoiceSelect
          key={name}
          id={`report-${name}`}
          label={t(`reports.filters.${name}`)}
          value={filters[name]}
          choices={extra[name]()}
          onChange={(value) => set({ [name]: value })}
        />
      ))}
    </div>
  );
}
