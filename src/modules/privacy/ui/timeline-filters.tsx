"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/components/button";
import { Checkbox } from "@/shared/ui/components/checkbox";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Field } from "@/shared/ui/forms/field";
import type { TimelineGroup } from "../domain/timeline-event";

export type TimelineFilterState = { groups: TimelineGroup[]; from: string; to: string };

// The filter bar of the timeline (design system 5.20): one checkbox per group the viewer may see,
// the period and "Limpar filtros". Filters apply on change; there is no primary button.
export function TimelineFilters({
  visibleGroups,
  value,
  periodError,
  onChange,
  onClear,
}: {
  visibleGroups: TimelineGroup[];
  value: TimelineFilterState;
  periodError: string | null;
  onChange: (next: TimelineFilterState) => void;
  onClear: () => void;
}) {
  const t = useTranslations();
  const toggle = (group: TimelineGroup, checked: boolean) =>
    onChange({
      ...value,
      groups: checked
        ? visibleGroups.filter((item) => item === group || value.groups.includes(item))
        : value.groups.filter((item) => item !== group),
    });

  return (
    <div
      role="group"
      aria-label={t("privacy.ui.filtersLabel")}
      className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b pb-4"
    >
      <fieldset className="grid gap-2">
        <legend className="text-muted-foreground text-xs">{t("privacy.ui.eventTypes")}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {visibleGroups.map((group) => {
            const id = `timeline-group-${group}`;
            return (
              <div key={group} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={value.groups.includes(group)}
                  onCheckedChange={(checked) => toggle(group, checked === true)}
                />
                <Label htmlFor={id}>{t(`privacy.groups.${group}`)}</Label>
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-start gap-3">
        <Field id="timeline-from" label={t("privacy.ui.from")}>
          <Input
            id="timeline-from"
            type="date"
            className="w-40"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
          />
        </Field>
        <Field id="timeline-to" label={t("privacy.ui.to")} error={periodError ?? undefined}>
          <Input
            id="timeline-to"
            type="date"
            className="w-40"
            value={value.to}
            aria-invalid={periodError ? true : undefined}
            aria-describedby={periodError ? "timeline-to-error" : undefined}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
          />
        </Field>
      </div>
      <Button type="button" variant="ghost" onClick={onClear}>
        {t("privacy.ui.clearFilters")}
      </Button>
    </div>
  );
}
