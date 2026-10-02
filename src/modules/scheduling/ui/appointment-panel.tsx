"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { interpolate, type ActionResult } from "@/shared/kernel/action-result";
import { formatCents } from "@/shared/kernel/money";
import { Button } from "@/shared/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/components/sheet";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { BookingOptions } from "../application/booking-options";
import type { CancellationReasonItem } from "../application/cancellation-reasons";
import type { AppointmentDetails } from "../application/queries";
import type { SeriesPreview } from "../application/series";
import { withinUndoWindow } from "../domain/agenda-time";
import { CANCELLATION_ORIGIN_LABELS, type CancellationOrigin } from "../domain/appointment";
import { isOpen, nextStatuses, STATUS_LABELS, type AppointmentStatus } from "../domain/status";
import { SCHEDULING_TOASTS } from "../messages";
import { CancelForm } from "./cancel-form";
import { ChangeForm, type ChangeKind } from "./change-form";
import { dateTimeOf, longDate, localParts, STATUS_STAMPS, statusText, timeRange } from "./format";
import { JustificationDialog } from "./justification-dialog";
import { SeriesScopeDialog, type SeriesScope } from "./series-scope-dialog";
import type { ServiceOption } from "./booking-panel";

export type AppointmentActions = {
  get: (appointmentId: string) => Promise<ActionResult<AppointmentDetails>>;
  changeStatus: (input: unknown) => Promise<ActionResult<{ status: AppointmentStatus; version: number }>>;
  cancel: (input: unknown) => Promise<ActionResult<{ cancelledIds: string[]; skipped: number }>>;
  reschedule: (input: unknown) => Promise<ActionResult<{ appointmentId: string }>>;
  update: (input: unknown) => Promise<ActionResult<{ appointmentId: string }>>;
  previewSeriesEdit: (input: unknown) => Promise<ActionResult<SeriesPreview>>;
  editSeries: (input: unknown) => Promise<ActionResult<{ newSeriesId: string }>>;
  options: (input: { unitId: string; serviceId: string }) => Promise<ActionResult<BookingOptions>>;
};

export type Permissions = {
  canManage: boolean;
  canRevertAnyTime: boolean;
  linkedProfessionalId: string | null;
};

// Button text per target status (PRD F06 lifecycle; "desfazer" for the backward moves).
function transitionLabel(from: AppointmentStatus, to: AppointmentStatus): string {
  if (to === "CONFIRMED") return from === "CHECKED_IN" ? "Desfazer chegada" : "Confirmar";
  if (to === "SCHEDULED") return "Desfazer confirmação";
  if (to === "CHECKED_IN") return "Chegou";
  if (to === "IN_PROGRESS") return from === "COMPLETED" ? "Reabrir atendimento" : "Iniciar atendimento";
  if (to === "COMPLETED") return "Concluir";
  return "Faltou";
}

type Mode =
  | { kind: "details" }
  | { kind: "change"; change: ChangeKind; scope: SeriesScope }
  | { kind: "cancel"; scope: SeriesScope };

// Appointment side panel (PRD F06 Experience): details, one-click status changes, "Reagendar",
// "Editar", "Cancelar" and the link to the patient record.
export function AppointmentPanel({
  appointmentId,
  initialAction,
  granularity,
  services,
  reasons,
  permissions,
  actions,
  onChanged,
  onClose,
}: {
  appointmentId: string;
  initialAction?: "reschedule";
  granularity: number;
  services: ServiceOption[];
  reasons: CancellationReasonItem[];
  permissions: Permissions;
  actions: AppointmentActions;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<AppointmentDetails | null>(null);
  const [missing, setMissing] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "details" });
  const [askScope, setAskScope] = useState<"reschedule" | "edit" | "cancel" | null>(null);
  const [revert, setRevert] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const result = await actions.get(appointmentId);
    if (result.ok) setDetails(result.data);
    else setMissing(true);
    return result;
  }, [actions, appointmentId]);

  useEffect(() => {
    let active = true;
    void actions.get(appointmentId).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setMissing(true);
        return;
      }
      setDetails(result.data);
      if (initialAction === "reschedule" && isOpen(result.data.status)) {
        setMode({ kind: "change", change: "reschedule", scope: "THIS" });
      }
    });
    return () => {
      active = false;
    };
  }, [actions, appointmentId, initialAction]);

  const own = details !== null && permissions.linkedProfessionalId === details.professional.id;
  const zone = details?.unitTimeZone ?? "America/Sao_Paulo";

  function allowed(to: AppointmentStatus): boolean {
    if (!details) return false;
    const reverting = details.status === "COMPLETED" && to === "IN_PROGRESS";
    if (reverting) return own || permissions.canRevertAnyTime;
    if (permissions.canManage) return true;
    return own && (to === "IN_PROGRESS" || to === "COMPLETED");
  }

  function move(to: AppointmentStatus, justification?: string) {
    if (!details) return;
    const reverting = details.status === "COMPLETED" && to === "IN_PROGRESS";
    const ownWindow = own && withinUndoWindow(new Date(details.statusChangedAt), new Date());
    if (reverting && !ownWindow && justification === undefined) {
      setRevert(true);
      return;
    }
    startTransition(async () => {
      const result = await actions.changeStatus({
        appointmentId: details.id,
        version: details.version,
        to,
        ...(justification ? { justification } : {}),
      });
      if (!handleActionResult(result)) {
        await load();
        return;
      }
      setRevert(false);
      toast.success(interpolate(SCHEDULING_TOASTS.statusChanged, { status: STATUS_LABELS[to] }));
      await load();
      onChanged();
    });
  }

  function start(kind: "reschedule" | "edit" | "cancel") {
    if (details?.seriesId) {
      setAskScope(kind);
      return;
    }
    setMode(
      kind === "cancel" ? { kind: "cancel", scope: "THIS" } : { kind: "change", change: kind, scope: "THIS" },
    );
  }

  async function done(message: string) {
    toast.success(message);
    setMode({ kind: "details" });
    await load();
    onChanged();
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        {missing ? (
          <SheetHeader>
            <SheetTitle>Agendamento não encontrado</SheetTitle>
            <SheetDescription>Ele pode ter sido removido da sua agenda.</SheetDescription>
          </SheetHeader>
        ) : !details ? (
          <SheetHeader>
            <SheetTitle>Carregando agendamento...</SheetTitle>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {details.patient.displayName}
                <Stamp variant={STATUS_STAMPS[details.status]}>{statusText(details.status)}</Stamp>
                {details.isOverbooking ? <Stamp variant="warning">ENCAIXE</Stamp> : null}
              </SheetTitle>
              <SheetDescription>
                {longDate(localParts(details.startsAt, zone).date)} ·{" "}
                {timeRange(details.startsAt, details.endsAt, zone)} · {details.unitName}
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-6 px-6 pb-6">
              {mode.kind === "details" ? (
                <>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Serviço</dt>
                    <dd>{details.service.name}</dd>
                    <dt className="text-muted-foreground">Profissional</dt>
                    <dd>{details.professional.displayName}</dd>
                    <dt className="text-muted-foreground">Sala</dt>
                    <dd>{details.room?.name ?? "Sem sala"}</dd>
                    <dt className="text-muted-foreground">Valor</dt>
                    <dd className="tabular-nums">{formatCents(details.priceCents)}</dd>
                    {details.seriesIndex ? (
                      <>
                        <dt className="text-muted-foreground">Série</dt>
                        <dd>Sessão {details.seriesIndex}</dd>
                      </>
                    ) : null}
                    {details.notes ? (
                      <>
                        <dt className="text-muted-foreground">Observações</dt>
                        <dd className="whitespace-pre-wrap">{details.notes}</dd>
                      </>
                    ) : null}
                    {details.exceptionJustification ? (
                      <>
                        <dt className="text-muted-foreground">Exceção</dt>
                        <dd>{details.exceptionJustification}</dd>
                      </>
                    ) : null}
                    {details.cancellation ? (
                      <>
                        <dt className="text-muted-foreground">Cancelamento</dt>
                        <dd>
                          {CANCELLATION_ORIGIN_LABELS[details.cancellation.origin as CancellationOrigin]} ·{" "}
                          {details.cancellation.reasonName}
                          {details.cancellation.note ? ` · ${details.cancellation.note}` : ""}
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  <div className="flex flex-wrap gap-2">
                    {nextStatuses(details.status)
                      .filter(allowed)
                      .map((to) => (
                        <Button
                          key={to}
                          type="button"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => move(to)}
                        >
                          {transitionLabel(details.status, to)}
                        </Button>
                      ))}
                  </div>
                  {permissions.canManage && isOpen(details.status) ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" onClick={() => start("reschedule")}>
                        Reagendar
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => start("edit")}>
                        Editar
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => start("cancel")}>
                        Cancelar agendamento
                      </Button>
                    </div>
                  ) : null}
                  <Link
                    href={`/patients/${details.patient.id}`}
                    className="text-primary text-sm hover:underline"
                  >
                    Abrir cadastro do paciente
                  </Link>

                  <section className="grid gap-2">
                    <h3 className="section-title">Histórico</h3>
                    <div className="border-y">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead>Data e hora</TableHead>
                            <TableHead>Por</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {details.statusHistory.map((row, index) => (
                            <TableRow key={`${row.changedAt}-${index}`}>
                              <TableCell>
                                <Stamp variant={STATUS_STAMPS[row.toStatus]}>
                                  {statusText(row.toStatus)}
                                </Stamp>
                                {row.justification ? (
                                  <span className="text-muted-foreground block text-xs">
                                    {row.justification}
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {dateTimeOf(row.changedAt, zone)}
                              </TableCell>
                              <TableCell>{row.changedByName}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {details.reschedules.length > 0 ? (
                      <ul className="text-muted-foreground grid gap-1 text-xs">
                        {details.reschedules.map((row, index) => (
                          <li key={`${row.rescheduledAt}-${index}`}>
                            Reagendado em {dateTimeOf(row.rescheduledAt, zone)} por {row.rescheduledByName};
                            antes: {dateTimeOf(row.previousStartsAt, zone)} com {row.previousProfessionalName}
                            {row.previousRoomName ? `, ${row.previousRoomName}` : ""}.
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                </>
              ) : mode.kind === "cancel" ? (
                <CancelForm
                  details={details}
                  scope={mode.scope}
                  reasons={reasons}
                  cancel={actions.cancel}
                  onCancelled={() => done(SCHEDULING_TOASTS.cancelled)}
                  onBack={() => setMode({ kind: "details" })}
                />
              ) : (
                <ChangeForm
                  details={details}
                  change={mode.change}
                  scope={mode.scope}
                  granularity={granularity}
                  services={services}
                  actions={actions}
                  onSaved={() =>
                    done(
                      mode.change === "reschedule" ? SCHEDULING_TOASTS.rescheduled : SCHEDULING_TOASTS.saved,
                    )
                  }
                  onBack={() => setMode({ kind: "details" })}
                />
              )}
            </div>
            <SeriesScopeDialog
              open={askScope !== null}
              onOpenChange={(open) => !open && setAskScope(null)}
              onChoose={(scope) => {
                const kind = askScope;
                setAskScope(null);
                if (kind === "cancel") setMode({ kind: "cancel", scope });
                else if (kind) setMode({ kind: "change", change: kind, scope });
              }}
            />
            <JustificationDialog
              open={revert}
              title="Reabrir atendimento"
              description="Explique por que o atendimento concluído será reaberto."
              confirmLabel="Reabrir atendimento"
              pending={pending}
              onOpenChange={setRevert}
              onConfirm={(text) => move("IN_PROGRESS", text)}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
