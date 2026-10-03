"use client";

import { Checkbox } from "@/shared/ui/components/checkbox";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";

export type RecurrenceState = {
  frequency: "WEEKLY" | "BIWEEKLY";
  weekdays: number[];
  endMode: "count" | "date";
  endsAfter: string;
  endsOn: string;
};

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];

// Recurrence of the booking panel (PRD F06: weekly or every 2 weeks, 1–6 weekdays, ending after N
// sessions, at most 52, or on a date at most 12 months ahead).
export function RecurrenceFields({
  value,
  onChange,
  errors,
}: {
  value: RecurrenceState;
  onChange: (value: RecurrenceState) => void;
  errors: Record<string, string>;
}) {
  const toggle = (weekday: number, checked: boolean) =>
    onChange({
      ...value,
      weekdays: checked
        ? [...value.weekdays, weekday].sort()
        : value.weekdays.filter((item) => item !== weekday),
    });
  return (
    <fieldset className="grid gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-semibold">Repetição</legend>
      <div className="grid gap-2">
        <Label htmlFor="recurrence-frequency">Frequência</Label>
        <Select
          value={value.frequency}
          onValueChange={(frequency) =>
            onChange({ ...value, frequency: frequency as RecurrenceState["frequency"] })
          }
        >
          <SelectTrigger id="recurrence-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WEEKLY">Toda semana</SelectItem>
            <SelectItem value="BIWEEKLY">A cada 2 semanas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium" id="recurrence-weekdays">
          Dias da semana
        </span>
        <div role="group" aria-labelledby="recurrence-weekdays" className="flex flex-wrap gap-3">
          {WEEKDAYS.map((weekday) => (
            <label key={weekday.value} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={value.weekdays.includes(weekday.value)}
                onCheckedChange={(checked) => toggle(weekday.value, checked === true)}
              />
              {weekday.label}
            </label>
          ))}
        </div>
        {errors["recurrence.weekdays"] ? (
          <p role="alert" className="text-destructive text-sm">
            {errors["recurrence.weekdays"]}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">Termina</span>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="recurrence-end"
              checked={value.endMode === "count"}
              onChange={() => onChange({ ...value, endMode: "count" })}
            />
            Após
          </label>
          <Input
            aria-label="Número de sessões"
            type="number"
            min={2}
            max={52}
            className="w-20"
            value={value.endsAfter}
            disabled={value.endMode !== "count"}
            onChange={(event) => onChange({ ...value, endsAfter: event.target.value })}
          />
          <span>sessões</span>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="recurrence-end"
              checked={value.endMode === "date"}
              onChange={() => onChange({ ...value, endMode: "date" })}
            />
            Em
          </label>
          <Input
            aria-label="Data final"
            type="date"
            className="w-40"
            value={value.endsOn}
            disabled={value.endMode !== "date"}
            onChange={(event) => onChange({ ...value, endsOn: event.target.value })}
          />
        </div>
        {errors["recurrence.endsAfter"] || errors["recurrence.endsOn"] ? (
          <p role="alert" className="text-destructive text-sm">
            {errors["recurrence.endsAfter"] ?? errors["recurrence.endsOn"]}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

export function recurrenceInput(value: RecurrenceState) {
  return {
    frequency: value.frequency,
    weekdays: value.weekdays,
    endsAfter: value.endMode === "count" ? Number(value.endsAfter) || null : null,
    endsOn: value.endMode === "date" ? value.endsOn || null : null,
  };
}
