"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Switch } from "@/shared/ui/components/switch";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { formatMinutes, MAX_INTERVALS_PER_DAY, WEEKDAY_LABELS, type Week } from "../domain/business-hours";

const toMinutes = (value: string) => {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
};

const DEFAULT_INTERVAL = { start: 480, end: 1080 };
const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];

export function BusinessHoursForm({
  unitId,
  initial,
  readOnly = false,
  action,
}: {
  unitId: string;
  initial: Week;
  readOnly?: boolean;
  action: (input: { unitId: string; days: Week }) => Promise<ActionResult<{ affectedAppointments: number }>>;
}) {
  const router = useRouter();
  const [week, setWeek] = useState<Week>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const updateDay = (weekday: number, change: (day: Week[number]) => Week[number]) =>
    setWeek((current) => current.map((day) => (day.weekday === weekday ? change(day) : day)));

  const setTime = (weekday: number, index: number, key: "start" | "end", value: string) =>
    updateDay(weekday, (day) => ({
      ...day,
      intervals: day.intervals.map((interval, position) =>
        position === index
          ? {
              ...interval,
              // An end time of 00:00 means midnight at the end of the day (1440).
              [key]: key === "end" && value === "00:00" ? 1440 : toMinutes(value),
            }
          : interval,
      ),
    }));

  const copyMondayToWeekdays = () => {
    const monday = week.find((day) => day.weekday === 1);
    if (!monday) return;
    setWeek((current) =>
      current.map((day) =>
        WEEKDAYS_MON_FRI.includes(day.weekday)
          ? { weekday: day.weekday, open: monday.open, intervals: monday.intervals.map((i) => ({ ...i })) }
          : day,
      ),
    );
  };

  const save = () =>
    startTransition(async () => {
      setErrors({});
      const result = await action({ unitId, days: week });
      if (!result.ok && result.error.fields) {
        setErrors(result.error.fields);
        toast.error(result.error.message, { duration: Infinity, closeButton: true });
        return;
      }
      if (handleActionResult(result, { successMessage: "Horário de funcionamento salvo" })) {
        if (result.data.affectedAppointments > 0) {
          toast.warning(
            `${result.data.affectedAppointments} agendamentos futuros ficaram fora do novo horário. Revise-os na agenda.`,
          );
        }
        router.refresh();
      }
    });

  return (
    <div className="grid max-w-3xl gap-4">
      <HydratedFieldset disabled={readOnly}>
        {week.map((day, index) => (
          <div key={day.weekday} className="grid gap-2 border-b py-3" data-weekday={day.weekday}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 font-medium">{WEEKDAY_LABELS[day.weekday]}</span>
              <div className="flex items-center gap-2">
                <Switch
                  id={`open-${day.weekday}`}
                  checked={day.open}
                  onCheckedChange={(open) =>
                    updateDay(day.weekday, () => ({
                      weekday: day.weekday,
                      open,
                      intervals: open ? [{ ...DEFAULT_INTERVAL }] : [],
                    }))
                  }
                />
                <Label htmlFor={`open-${day.weekday}`}>{day.open ? "Aberto" : "Fechado"}</Label>
              </div>
              {day.open
                ? day.intervals.map((interval, position) => (
                    <div key={position} className="flex items-center gap-1">
                      <Input
                        type="time"
                        step={300}
                        aria-label={`${WEEKDAY_LABELS[day.weekday]} início ${position + 1}`}
                        className="w-28"
                        value={formatMinutes(interval.start)}
                        onChange={(event) => setTime(day.weekday, position, "start", event.target.value)}
                      />
                      <span>–</span>
                      <Input
                        type="time"
                        step={300}
                        aria-label={`${WEEKDAY_LABELS[day.weekday]} fim ${position + 1}`}
                        className="w-28"
                        value={formatMinutes(interval.end === 1440 ? 0 : interval.end)}
                        onChange={(event) => setTime(day.weekday, position, "end", event.target.value)}
                      />
                      {position > 0 && !readOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remover intervalo"
                          onClick={() =>
                            updateDay(day.weekday, (current) => ({
                              ...current,
                              intervals: current.intervals.slice(0, 1),
                            }))
                          }
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </div>
                  ))
                : null}
              {day.open && day.intervals.length < MAX_INTERVALS_PER_DAY && !readOnly ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateDay(day.weekday, (current) => {
                      const last = current.intervals.at(-1) ?? DEFAULT_INTERVAL;
                      const start = Math.min(last.end + 60, 1380);
                      return {
                        ...current,
                        intervals: [...current.intervals, { start, end: Math.min(start + 240, 1440) }],
                      };
                    })
                  }
                >
                  <Plus />
                  Intervalo
                </Button>
              ) : null}
            </div>
            {errors[`days.${index}`] ? (
              <p role="alert" className="text-destructive text-sm">
                {errors[`days.${index}`]}
              </p>
            ) : null}
          </div>
        ))}
        {readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Salvando..." : "Salvar horário"}
            </Button>
            <Button type="button" variant="outline" onClick={copyMondayToWeekdays}>
              Copiar segunda para todos os dias úteis
            </Button>
          </div>
        )}
      </HydratedFieldset>
    </div>
  );
}
