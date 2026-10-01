"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { interpolate, type ActionResult } from "@/shared/kernel/action-result";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/components/alert-dialog";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/components/tabs";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import type { UnitInfo } from "../application/ports";
import type { DeleteScheduleResult, SaveScheduleResult, ScheduleItem } from "../application/schedules";
import { formatDateBR, nextMonday } from "../domain/dates";
import { utcOffsetMinutes } from "../domain/time-zone-offsets";
import {
  findCrossUnitConflict,
  findOutsideBusinessHours,
  validateIntervals,
  type WorkingInterval,
} from "../domain/working-hours";
import { crossUnitConflictMessage, outsideBusinessHoursMessage } from "../domain/working-hours-text";
import { PROFESSIONALS_SCHEDULE_PREVIOUS_CLOSED } from "../messages";
import { WeekGrid } from "./week-grid";

type Draft = {
  scheduleId: string | null;
  version: number | null;
  validFrom: string;
  validUntil: string | null;
  intervals: WorkingInterval[];
};

type SaveInput = {
  professionalId: string;
  scheduleId: string | null;
  version: number | null;
  validFrom: string;
  validUntil: string | null;
  intervals: WorkingInterval[];
};

const NEW = "new";
const DEFAULT_INTERVAL = { start: 480, end: 720 };

function scheduleLabel(schedule: Pick<ScheduleItem, "state" | "validFrom" | "validUntil">): string {
  const until = schedule.validUntil ? ` até ${formatDateBR(schedule.validUntil)}` : "";
  if (schedule.state === "ended")
    return `Encerrado em ${formatDateBR(schedule.validUntil ?? schedule.validFrom)}`;
  if (schedule.state === "future") return `A partir de ${formatDateBR(schedule.validFrom)}${until}`;
  return `Vigente desde ${formatDateBR(schedule.validFrom)}${until}`;
}

function fromSchedule(schedule: ScheduleItem): Draft {
  return {
    scheduleId: schedule.id,
    version: schedule.version,
    validFrom: schedule.validFrom,
    validUntil: schedule.validUntil,
    intervals: schedule.intervals.map((interval) => ({ ...interval })),
  };
}

// Client-side copy of the server rules (spec F04 section 3), so the grid marks problems before
// saving: shape, business hours (PRD F04: highlighted in red) and cross-unit conflicts.
function intervalErrors(
  intervals: WorkingInterval[],
  units: UnitInfo[],
  validFrom: string,
): Record<number, string> {
  const errors: Record<number, string> = {};
  const shape = validateIntervals(intervals) ?? {};
  for (const [key, message] of Object.entries(shape)) errors[Number(key.split(".")[1])] = message;
  const weeks = new Map(units.map((unit) => [unit.id, unit.businessHours]));
  for (const item of findOutsideBusinessHours(intervals, weeks)) {
    errors[item.index] ??= outsideBusinessHoursMessage(item.day, item.weekday);
  }
  if (Object.keys(errors).length === 0) {
    const reference = new Date(`${validFrom || "2026-01-01"}T12:00:00.000Z`);
    const offsets = new Map(units.map((unit) => [unit.id, utcOffsetMinutes(unit.timeZone, reference)]));
    const conflict = findCrossUnitConflict(intervals, offsets);
    const other = conflict ? intervals[conflict.conflictWith] : undefined;
    if (conflict && other) {
      errors[conflict.index] = crossUnitConflictMessage(
        units.find((unit) => unit.id === other.unitId)?.name ?? "",
        other,
      );
    }
  }
  return errors;
}

// Horários tab (PRD F04 Experience): weekly grid per unit with validity dates and "Copiar semana".
export function ScheduleEditor({
  professionalId,
  today,
  schedules,
  units,
  readOnly = false,
  actions,
}: {
  professionalId: string;
  today: string;
  schedules: ScheduleItem[];
  units: UnitInfo[];
  readOnly?: boolean;
  actions: {
    save: (input: SaveInput) => Promise<ActionResult<SaveScheduleResult>>;
    remove: (input: { scheduleId: string }) => Promise<ActionResult<DeleteScheduleResult>>;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial =
    schedules.find((schedule) => schedule.state === "current") ??
    schedules.find((schedule) => schedule.state === "future");
  const [draft, setDraft] = useState<Draft>(() =>
    initial
      ? fromSchedule(initial)
      : { scheduleId: null, version: null, validFrom: today, validUntil: null, intervals: [] },
  );
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [unitTab, setUnitTab] = useState(units[0]?.id ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const stored = schedules.find((schedule) => schedule.id === draft.scheduleId);
  const state = stored?.state ?? "future";
  const locked = readOnly || state === "ended";
  const clientErrors = useMemo(
    () => intervalErrors(draft.intervals, units, draft.validFrom),
    [draft.intervals, draft.validFrom, units],
  );
  const errors: Record<number, string> = { ...clientErrors };
  for (const [key, message] of Object.entries(serverErrors)) {
    if (key.startsWith("intervals.")) errors[Number(key.split(".")[1])] ??= message;
  }

  const edit = (change: (current: Draft) => Draft) => {
    setServerErrors({});
    setDraft(change);
  };
  const setIntervals = (change: (intervals: WorkingInterval[]) => WorkingInterval[]) =>
    edit((current) => ({ ...current, intervals: change(current.intervals) }));

  const startNew = (copy: boolean) =>
    edit((current) => ({
      scheduleId: null,
      version: null,
      validFrom: schedules.length === 0 ? today : nextMonday(today),
      validUntil: null,
      intervals: copy ? current.intervals.map((interval) => ({ ...interval })) : [],
    }));

  const save = () =>
    startTransition(async () => {
      if (Object.keys(clientErrors).length > 0) {
        toast.error("Verifique os horários destacados.", { duration: Infinity, closeButton: true });
        return;
      }
      const result = await actions.save({ professionalId, ...draft });
      if (!result.ok && result.error.fields) {
        setServerErrors(result.error.fields);
        toast.error(result.error.message, { duration: Infinity, closeButton: true });
        return;
      }
      if (handleActionResult(result, { successMessage: "Horário salvo." })) {
        setDraft((current) => ({
          ...current,
          scheduleId: result.data.scheduleId,
          version: result.data.version,
        }));
        if (result.data.closedPrevious) {
          toast.info(
            interpolate(PROFESSIONALS_SCHEDULE_PREVIOUS_CLOSED, {
              date: formatDateBR(result.data.closedPrevious.validUntil),
            }),
          );
        }
        router.refresh();
      }
    });

  const remove = () =>
    startTransition(async () => {
      setConfirmingDelete(false);
      if (!draft.scheduleId) return;
      const result = await actions.remove({ scheduleId: draft.scheduleId });
      if (handleActionResult(result, { successMessage: "Horário excluído." })) {
        const next = schedules.find(
          (schedule) => schedule.id !== draft.scheduleId && schedule.state !== "ended",
        );
        setDraft(
          next
            ? {
                ...fromSchedule(next),
                validUntil: result.data.restoredPrevious?.validUntil ?? next.validUntil,
              }
            : { scheduleId: null, version: null, validFrom: today, validUntil: null, intervals: [] },
        );
        router.refresh();
      }
    });

  if (units.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nenhuma unidade ativa. Cadastre as unidades e o horário de funcionamento em Configurações › Unidades.
      </p>
    );
  }

  const selectValue = draft.scheduleId ?? NEW;
  return (
    <div className="grid max-w-4xl gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field id="schedule-select" label="Horário">
          <Select
            value={selectValue}
            onValueChange={(value) => {
              const schedule = schedules.find((item) => item.id === value);
              if (schedule) edit(() => fromSchedule(schedule));
            }}
          >
            <SelectTrigger id="schedule-select" className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {draft.scheduleId === null ? (
                <SelectItem value={NEW}>Novo horário (não salvo)</SelectItem>
              ) : null}
              {schedules.map((schedule) => (
                <SelectItem key={schedule.id} value={schedule.id}>
                  {scheduleLabel(schedule)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {readOnly ? null : (
          <>
            <Button type="button" variant="outline" onClick={() => startNew(false)}>
              Novo horário
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => startNew(true)}
              disabled={draft.intervals.length === 0}
            >
              Copiar semana
            </Button>
            {stored?.deletable ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                Excluir horário
              </Button>
            ) : null}
          </>
        )}
      </div>

      <HydratedFieldset disabled={locked}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="schedule-valid-from"
            label="Vale a partir de"
            error={serverErrors.validFrom}
            hint={
              state === "current" && draft.scheduleId
                ? "Horário vigente: a data de início não muda."
                : undefined
            }
          >
            <Input
              id="schedule-valid-from"
              type="date"
              min={today}
              value={draft.validFrom}
              disabled={state === "current" && draft.scheduleId !== null}
              onChange={(event) => edit((current) => ({ ...current, validFrom: event.target.value }))}
            />
          </Field>
          <Field id="schedule-valid-until" label="Vale até (opcional)" error={serverErrors.validUntil}>
            <Input
              id="schedule-valid-until"
              type="date"
              min={draft.validFrom > today ? draft.validFrom : today}
              value={draft.validUntil ?? ""}
              onChange={(event) =>
                edit((current) => ({ ...current, validUntil: event.target.value || null }))
              }
            />
          </Field>
        </div>

        <Tabs value={unitTab} onValueChange={setUnitTab}>
          <TabsList>
            {units.map((unit) => {
              const count = draft.intervals.filter((interval) => interval.unitId === unit.id).length;
              return (
                <TabsTrigger key={unit.id} value={unit.id}>
                  {unit.name} ({count})
                </TabsTrigger>
              );
            })}
          </TabsList>
          {units.map((unit) => (
            <TabsContent key={unit.id} value={unit.id} className="pt-4">
              <WeekGrid
                unit={unit}
                intervals={draft.intervals
                  .map((interval, index) => ({ index, interval }))
                  .filter((item) => item.interval.unitId === unit.id)
                  .sort((a, b) => a.interval.start - b.interval.start)}
                errors={errors}
                readOnly={locked}
                onChange={(index, interval) =>
                  setIntervals((intervals) =>
                    intervals.map((item, position) => (position === index ? interval : item)),
                  )
                }
                onAdd={(weekday) =>
                  setIntervals((intervals) => {
                    const sameDay = intervals.filter(
                      (item) => item.unitId === unit.id && item.weekday === weekday,
                    );
                    const lastEnd = Math.max(0, ...sameDay.map((item) => item.end));
                    const start = sameDay.length > 0 ? Math.min(lastEnd + 60, 1380) : DEFAULT_INTERVAL.start;
                    const end = sameDay.length > 0 ? Math.min(start + 240, 1440) : DEFAULT_INTERVAL.end;
                    return [...intervals, { unitId: unit.id, weekday, start, end }];
                  })
                }
                onRemove={(index) =>
                  setIntervals((intervals) => intervals.filter((_, position) => position !== index))
                }
                onCopyToWeekdays={(weekday) =>
                  setIntervals((intervals) => {
                    const source = intervals.filter(
                      (item) => item.unitId === unit.id && item.weekday === weekday,
                    );
                    const kept = intervals.filter(
                      (item) => item.unitId !== unit.id || item.weekday === weekday || item.weekday > 5,
                    );
                    const copies = [1, 2, 3, 4, 5]
                      .filter((day) => day !== weekday)
                      .flatMap((day) => source.map((item) => ({ ...item, weekday: day })));
                    return [...kept, ...copies];
                  })
                }
              />
            </TabsContent>
          ))}
        </Tabs>

        {locked ? null : (
          <div>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Salvando..." : "Salvar horário"}
            </Button>
          </div>
        )}
      </HydratedFieldset>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir horário?</AlertDialogTitle>
            <AlertDialogDescription>
              O horário {stored ? scheduleLabel(stored).toLowerCase() : ""} ainda não começou e será excluído.
              O horário anterior volta a valer no lugar dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Excluir horário
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
