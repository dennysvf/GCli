"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Switch } from "@/shared/ui/components/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import type { AffectedAppointment } from "../application/ports";
import type { CreateTimeOffResult, TimeOffItem } from "../application/time-offs";
import { TIME_OFF_TYPE_LABELS, TIME_OFF_TYPES, type TimeOffType } from "../domain/time-offs";
import { PROFESSIONALS_TIME_OFF_AFFECTED_APPOINTMENTS } from "../notices";

type CreateInput = {
  professionalId: string;
  type: TimeOffType;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  note: string | null;
};

function formatter(timeZone: string, withTime: boolean) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

// "21/12/2026 a 04/01/2027" for whole days; "22/12/2026 08:00 – 22/12/2026 12:30" otherwise.
export function formatTimeOffPeriod(
  item: Pick<TimeOffItem, "startsAt" | "endsAt" | "allDay">,
  timeZone: string,
) {
  if (item.allDay) {
    const date = formatter(timeZone, false);
    // The stored end is midnight after the last day.
    const lastDay = new Date(new Date(item.endsAt).getTime() - 60_000);
    const start = date.format(new Date(item.startsAt));
    const end = date.format(lastDay);
    return start === end ? start : `${start} a ${end}`;
  }
  const dateTime = formatter(timeZone, true);
  return `${dateTime.format(new Date(item.startsAt))} – ${dateTime.format(new Date(item.endsAt))}`;
}

function rescheduleHref(appointmentId: string) {
  // F06 URL contract: opens the appointment ready to reschedule.
  return `/schedule?appointment=${appointmentId}&action=reschedule`;
}

// Ausências tab (PRD F04): current and upcoming time-offs; professionals manage their own,
// managers manage everyone's. Ended time-offs stay as history behind "Mostrar anteriores".
export function TimeOffsPanel({
  professionalId,
  timeZone,
  items,
  canManage,
  showingEnded,
  today,
  actions,
}: {
  professionalId: string;
  timeZone: string;
  items: TimeOffItem[];
  canManage: boolean;
  showingEnded: boolean;
  today: string;
  actions: {
    create: (input: CreateInput) => Promise<ActionResult<CreateTimeOffResult>>;
    remove: (input: { timeOffId: string }) => Promise<ActionResult<unknown>>;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<TimeOffItem | null>(null);

  const remove = () =>
    startTransition(async () => {
      const target = removing;
      setRemoving(null);
      if (!target) return;
      if (
        handleActionResult(await actions.remove({ timeOffId: target.id }), {
          successMessage: "Ausência excluída.",
        })
      ) {
        router.refresh();
      }
    });

  return (
    <div className="grid max-w-4xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Períodos em que o profissional não pode ser agendado. Horários no fuso da organização.
        </p>
        {canManage ? <Button onClick={() => setOpen(true)}>Nova ausência</Button> : null}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground">
          {showingEnded ? "Nenhuma ausência registrada." : "Nenhuma ausência programada."}
        </p>
      ) : (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Observação</TableHead>
                <TableHead className="hidden md:table-cell">Registrada por</TableHead>
                {canManage ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className={item.deletable ? undefined : "text-muted-foreground"}>
                  <TableCell className="font-semibold tabular-nums">
                    {formatTimeOffPeriod(item, timeZone)}
                  </TableCell>
                  <TableCell>{TIME_OFF_TYPE_LABELS[item.type]}</TableCell>
                  <TableCell className="hidden md:table-cell">{item.note ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{item.createdByName ?? "—"}</TableCell>
                  {canManage ? (
                    <TableCell>
                      {item.deletable ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Excluir ausência de ${formatTimeOffPeriod(item, timeZone)}`}
                          disabled={pending}
                          onClick={() => setRemoving(item)}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Link
        href={showingEnded ? "?tab=time-offs" : "?tab=time-offs&ended=1"}
        scroll={false}
        className="text-primary text-sm underline-offset-4 hover:underline"
      >
        {showingEnded ? "Mostrar só as próximas" : "Mostrar anteriores"}
      </Link>

      {canManage ? (
        <TimeOffDialog
          open={open}
          onOpenChange={setOpen}
          professionalId={professionalId}
          today={today}
          action={actions.create}
          onSaved={() => router.refresh()}
        />
      ) : null}

      <AlertDialog open={removing !== null} onOpenChange={(value) => !value && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ausência?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing ? formatTimeOffPeriod(removing, timeZone) : ""} volta a ficar disponível para
              agendamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Excluir ausência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TimeOffDialog({
  open,
  onOpenChange,
  professionalId,
  today,
  action,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionalId: string;
  today: string;
  action: (input: CreateInput) => Promise<ActionResult<CreateTimeOffResult>>;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const empty = { type: "VACATION" as TimeOffType, allDay: true, startsAt: today, endsAt: today, note: "" };
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [affected, setAffected] = useState<AffectedAppointment[] | null>(null);

  const close = (value: boolean) => {
    if (!value) {
      setValues(empty);
      setErrors({});
      setAffected(null);
    }
    onOpenChange(value);
  };

  const setAllDay = (allDay: boolean) =>
    setValues((current) => ({
      ...current,
      allDay,
      startsAt: allDay ? current.startsAt.slice(0, 10) : `${current.startsAt.slice(0, 10)}T08:00`,
      endsAt: allDay ? current.endsAt.slice(0, 10) : `${current.endsAt.slice(0, 10)}T12:00`,
    }));

  const submit = () =>
    startTransition(async () => {
      setErrors({});
      const result = await action({ professionalId, ...values, note: values.note.trim() || null });
      if (!result.ok && result.error.fields) {
        setErrors(result.error.fields);
        return;
      }
      if (!handleActionResult(result, { successMessage: "Ausência registrada." })) return;
      onSaved();
      // PRD F04: appointments in the period are listed with a link to reschedule each one.
      if (result.data.affectedAppointments.length > 0) setAffected(result.data.affectedAppointments);
      else close(false);
    });

  const inputType = values.allDay ? "date" : "datetime-local";
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {affected ? (
          <>
            <DialogHeader>
              <DialogTitle>Agendamentos no período</DialogTitle>
              <DialogDescription>
                {interpolate(PROFESSIONALS_TIME_OFF_AFFECTED_APPOINTMENTS, { count: affected.length })}
              </DialogDescription>
            </DialogHeader>
            <ul className="divide-y border-y">
              {affected.map((appointment) => (
                <li
                  key={appointment.appointmentId}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
                      new Date(appointment.startsAt),
                    )}{" "}
                    · {appointment.patientName} · {appointment.serviceName}
                  </span>
                  <Link
                    className="text-primary underline-offset-4 hover:underline"
                    href={rescheduleHref(appointment.appointmentId)}
                  >
                    Reagendar
                  </Link>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Nova ausência</DialogTitle>
              <DialogDescription>
                O período fica indisponível na agenda. Até 1 ano a partir de hoje.
              </DialogDescription>
            </DialogHeader>
            <HydratedFieldset>
              <Field id="time-off-type" label="Tipo" error={errors.type}>
                <Select
                  value={values.type}
                  onValueChange={(type) =>
                    setValues((current) => ({ ...current, type: type as TimeOffType }))
                  }
                >
                  <SelectTrigger id="time-off-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OFF_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TIME_OFF_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center justify-between gap-3">
                <div className="grid gap-0.5">
                  <Label htmlFor="time-off-all-day">Dia inteiro</Label>
                  <span className="text-muted-foreground text-xs">
                    Do início do primeiro dia ao fim do último.
                  </span>
                </div>
                <Switch id="time-off-all-day" checked={values.allDay} onCheckedChange={setAllDay} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="time-off-start" label="Início" error={errors.startsAt}>
                  <Input
                    id="time-off-start"
                    type={inputType}
                    step={values.allDay ? undefined : 300}
                    min={values.allDay ? today : `${today}T00:00`}
                    value={values.startsAt}
                    aria-invalid={!!errors.startsAt}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, startsAt: event.target.value }))
                    }
                  />
                </Field>
                <Field id="time-off-end" label={values.allDay ? "Último dia" : "Fim"} error={errors.endsAt}>
                  <Input
                    id="time-off-end"
                    type={inputType}
                    step={values.allDay ? undefined : 300}
                    min={values.startsAt}
                    value={values.endsAt}
                    aria-invalid={!!errors.endsAt}
                    onChange={(event) => setValues((current) => ({ ...current, endsAt: event.target.value }))}
                  />
                </Field>
              </div>
              <Field id="time-off-note" label="Observação (opcional)" error={errors.note}>
                <Textarea
                  id="time-off-note"
                  maxLength={200}
                  placeholder="Ex.: Congresso Brasileiro de Dermatologia"
                  value={values.note}
                  onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))}
                />
              </Field>
            </HydratedFieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Registrando..." : "Registrar ausência"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
