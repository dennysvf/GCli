"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { cn } from "@/shared/ui/utils";
import type { UnitInfo } from "../application/ports";
import { DAY_MINUTES, MAX_INTERVALS_PER_UNIT_DAY } from "../domain/limits";
import { formatMinutes, type WorkingInterval } from "../domain/working-hours";
import { formatBusinessDay } from "../domain/working-hours-text";

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

export type IndexedInterval = { index: number; interval: WorkingInterval };

const toMinutes = (value: string, isEnd: boolean) => {
  const [hours = "0", minutes = "0"] = value.split(":");
  const total = Number(hours) * 60 + Number(minutes);
  // An end time of 00:00 means midnight at the end of the day.
  return isEnd && total === 0 ? DAY_MINUTES : total;
};

// Weekly grid of one unit (design system 5.9): one row per weekday with the unit's business hours
// written under the day name, up to 4 intervals, and the rule broken by each interval as text.
export function WeekGrid({
  unit,
  intervals,
  errors,
  readOnly,
  onChange,
  onAdd,
  onRemove,
  onCopyToWeekdays,
}: {
  unit: UnitInfo;
  intervals: IndexedInterval[];
  errors: Record<number, string>;
  readOnly: boolean;
  onChange: (index: number, interval: WorkingInterval) => void;
  onAdd: (weekday: number) => void;
  onRemove: (index: number) => void;
  onCopyToWeekdays: (weekday: number) => void;
}) {
  return (
    <div className="divide-y border-y">
      {[1, 2, 3, 4, 5, 6, 7].map((weekday) => {
        const day = unit.businessHours.find((item) => item.weekday === weekday);
        const dayIntervals = intervals.filter((item) => item.interval.weekday === weekday);
        const reference = day?.open ? `Funcionamento: ${formatBusinessDay(day, weekday)}` : "Unidade fechada";
        return (
          <div
            key={weekday}
            className="grid gap-3 py-3 md:grid-cols-[10rem_1fr]"
            data-weekday={weekday}
            data-testid={`weekday-${weekday}`}
          >
            <div className="grid content-start gap-0.5">
              <span className="font-semibold">{WEEKDAY_LABELS[weekday]}</span>
              <span className="text-muted-foreground text-xs">{reference}</span>
            </div>
            <div className="grid gap-2">
              {dayIntervals.length === 0 ? (
                <span className="text-muted-foreground text-sm">Não atende</span>
              ) : null}
              {dayIntervals.map(({ index, interval }, position) => {
                const error = errors[index];
                const label = `${WEEKDAY_LABELS[weekday]}, intervalo ${position + 1}`;
                return (
                  <div key={index} className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        step={300}
                        aria-label={`${label}, início`}
                        aria-invalid={!!error}
                        aria-describedby={error ? `interval-${index}-error` : undefined}
                        className={cn("w-28", error && "border-destructive")}
                        value={formatMinutes(interval.start)}
                        onChange={(event) =>
                          onChange(index, { ...interval, start: toMinutes(event.target.value, false) })
                        }
                      />
                      <span className="text-muted-foreground text-sm">até</span>
                      <Input
                        type="time"
                        step={300}
                        aria-label={`${label}, término`}
                        aria-invalid={!!error}
                        aria-describedby={error ? `interval-${index}-error` : undefined}
                        className={cn("w-28", error && "border-destructive")}
                        value={formatMinutes(interval.end === DAY_MINUTES ? 0 : interval.end)}
                        onChange={(event) =>
                          onChange(index, { ...interval, end: toMinutes(event.target.value, true) })
                        }
                      />
                      {readOnly ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remover ${label.toLowerCase()}`}
                          onClick={() => onRemove(index)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                    {error ? (
                      <p id={`interval-${index}-error`} role="alert" className="text-destructive text-sm">
                        {error}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {readOnly ? null : (
                <div className="flex flex-wrap gap-2">
                  {dayIntervals.length < MAX_INTERVALS_PER_UNIT_DAY ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onAdd(weekday)}>
                      <Plus />
                      Adicionar intervalo
                    </Button>
                  ) : null}
                  {dayIntervals.length > 0 && weekday <= 5 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onCopyToWeekdays(weekday)}>
                      Copiar para os dias úteis
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
