"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { PERIOD_PRESETS, type PeriodPreset } from "../domain/period";

export type FilterState = {
  period: PeriodPreset;
  from: string;
  to: string;
  unit: string;
  professional: string;
};
export type FilterOption = { id: string; name: string; active: boolean };

const ALL = "ALL";

// The filter bar of the dashboard (PRD F12, design system 5.17): filters apply on change.
export function DashboardFilters({
  filters,
  units,
  professionals,
  onChange,
}: {
  filters: FilterState;
  units: FilterOption[];
  professionals: FilterOption[];
  onChange: (next: FilterState) => void;
}) {
  const t = useTranslations("analytics");
  const changeFrom = (value: string) => value && onChange({ ...filters, from: value });
  const changeTo = (value: string) => value && onChange({ ...filters, to: value });
  return (
    <div role="group" aria-label={t("ui.filters")} className="flex flex-wrap items-end gap-4">
      <div className="grid gap-1">
        <Label htmlFor="dashboard-period">{t("ui.period")}</Label>
        <Select
          value={filters.period}
          onValueChange={(value) => onChange({ ...filters, period: value as PeriodPreset })}
        >
          <SelectTrigger id="dashboard-period" className="min-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_PRESETS.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {t(`presets.${preset}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filters.period === "CUSTOM" ? (
        <>
          <div className="grid gap-1">
            <Label htmlFor="dashboard-from">{t("ui.from")}</Label>
            <Input
              id="dashboard-from"
              type="date"
              value={filters.from}
              onChange={(event) => changeFrom(event.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="dashboard-to">{t("ui.to")}</Label>
            <Input
              id="dashboard-to"
              type="date"
              value={filters.to}
              onChange={(event) => changeTo(event.target.value)}
            />
          </div>
        </>
      ) : null}
      <div className="grid gap-1">
        <Label htmlFor="dashboard-unit">{t("ui.unit")}</Label>
        <Select value={filters.unit} onValueChange={(value) => onChange({ ...filters, unit: value })}>
          <SelectTrigger id="dashboard-unit" className="min-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("ui.allUnits")}</SelectItem>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.active ? unit.name : t("ui.inactiveUnit", { name: unit.name })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="dashboard-professional">{t("ui.professional")}</Label>
        <Select
          value={filters.professional}
          onValueChange={(value) => onChange({ ...filters, professional: value })}
        >
          <SelectTrigger id="dashboard-professional" className="min-w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("ui.allProfessionals")}</SelectItem>
            {professionals.map((professional) => (
              <SelectItem key={professional.id} value={professional.id}>
                {professional.active
                  ? professional.name
                  : t("ui.inactiveProfessional", { name: professional.name })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
