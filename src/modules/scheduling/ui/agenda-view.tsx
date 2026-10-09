"use client";

import type { CountryCode, Currency } from "@/shared/kernel/countries/codes";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { addDays, formatMinute, weekStart } from "@/shared/kernel/calendar-date";
import type { ActionResult } from "@/shared/kernel/action-result";
import { localMinuteToUtc } from "@/shared/kernel/zoned-time";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/components/alert-dialog";
import { Button } from "@/shared/ui/components/button";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { FindingDto } from "../application/booking";
import type { CancellationReasonItem } from "../application/cancellation-reasons";
import type { AgendaItem, AppointmentList as AppointmentListData } from "../application/queries";
import type { AppointmentStatus } from "../domain/status";
import { AgendaToolbar, type AgendaBy, type AgendaViewKind, type ToolbarState } from "./agenda-toolbar";
import { AppointmentsTable } from "./appointments-table";
import {
  AppointmentPanel,
  type AppointmentActions,
  type PackageChoiceSlot,
  type PanelSection,
  type Permissions,
} from "./appointment-panel";
import { AvailabilityDialog } from "./availability-dialog";
import {
  BookingPanel,
  type BookingActions,
  type BookingDraft,
  type PatientFormData,
  type ServiceOption,
} from "./booking-panel";
import { ConflictFindings, hasBlocking, needsOverbooking } from "./conflict-findings";
import { localParts, useAgendaFormat } from "./format";
import { useFindingText } from "./finding-text";
import { TimeGrid, type GridColumn } from "./time-grid";
import { useAgenda, visibleItems, type AgendaRequest } from "./use-agenda";
import { useTranslations } from "next-intl";

export type AgendaViewProps = {
  unitId: string;
  unitName: string;
  unitCurrency: Currency;
  unitCountry: CountryCode;
  timeZone: string;
  granularity: number;
  today: string;
  initial: ToolbarState;
  services: ServiceOption[];
  reasons: CancellationReasonItem[];
  permissions: Permissions & { canOverride: boolean; ownOnly: boolean; canRegisterPatient: boolean };
  list: AppointmentListData | null;
  openAppointment: { id: string; action?: "reschedule" } | null;
  patientForm: PatientFormData;
  actions: BookingActions & AppointmentActions;
  // The "Cobrança" section of the side panel (F09), composed by the page.
  chargeSection?: PanelSection | undefined;
  // The "Usar pacote" choice of the booking and edit forms (F10), composed by the page.
  packageSlot?: PackageChoiceSlot | undefined;
};

type Drop = { item: AgendaItem; column: GridColumn; minute: number; findings: FindingDto[] };

function toParams(state: ToolbarState): URLSearchParams {
  const params = new URLSearchParams({ view: state.view, date: state.date });
  if (state.by !== "professional") params.set("by", state.by);
  if (state.focusId) params.set("focus", state.focusId);
  if (state.professionalIds.length) params.set("professionals", state.professionalIds.join(","));
  if (state.serviceIds.length) params.set("services", state.serviceIds.join(","));
  if (state.statuses.length) params.set("statuses", state.statuses.join(","));
  return params;
}

// The agenda screen (PRD F06 Experience, design system 10.1): Day view per professional or room,
// Week view of one professional or room, List view; polling every 30 seconds; empty slots open the
// booking panel, appointments open the side panel; drag-and-drop reschedules.
export function AgendaView(props: AgendaViewProps) {
  const findingText = useFindingText();
  const fmt = useAgendaFormat();
  const t = useTranslations();
  const { unitId, timeZone, granularity, today, permissions, actions } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<ToolbarState>(props.initial);
  const [booking, setBooking] = useState<BookingDraft | null>(null);
  const [availability, setAvailability] = useState(false);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [dropOverbooking, setDropOverbooking] = useState(false);
  const [dropJustification, setDropJustification] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [pending, startTransition] = useTransition();
  const opened = props.openAppointment;

  // The "now" line and lateness move every minute.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const update = useCallback(
    (next: Partial<ToolbarState>) => {
      const merged = { ...state, ...next };
      setState(merged);
      const params = toParams(merged);
      if (unitId !== "all") params.set("unit", unitId);
      // The list view is rendered on the server (pagination), the others on the client.
      if (merged.view === "list" || state.view === "list") router.push(`${pathname}?${params.toString()}`);
      else router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [state, unitId, pathname, router],
  );

  const range = useMemo(() => {
    const from = state.view === "week" ? weekStart(state.date) : state.date;
    const to = state.view === "week" ? addDays(from, 6) : state.date;
    return { from, to };
  }, [state.view, state.date]);

  const request: AgendaRequest = useMemo(
    () => ({
      unitId,
      from: range.from,
      to: range.to,
      ...(state.professionalIds.length ? { professionalIds: state.professionalIds } : {}),
      ...(state.serviceIds.length ? { serviceIds: state.serviceIds } : {}),
      ...(state.statuses.length ? { statuses: state.statuses as AppointmentStatus[] } : {}),
    }),
    [unitId, range, state.professionalIds, state.serviceIds, state.statuses],
  );
  const agenda = useAgenda(request);
  const data = agenda.data;
  const rangeStart = localMinuteToUtc(range.from, 0, timeZone).getTime();
  const rangeEnd = localMinuteToUtc(range.to, 1440, timeZone).getTime();
  const items = data ? visibleItems(data.items, request, rangeStart, rangeEnd) : [];

  const professionals = (data?.professionals ?? []).map((column) => ({ id: column.id, label: column.label }));
  const rooms = (data?.rooms ?? []).map((column) => ({ id: column.id, label: column.label }));
  const hoursOf = (date: string) => data?.unitHours?.find((day) => day.date === date);

  const columns: GridColumn[] = useMemo(() => {
    if (!data) return [];
    const ownColumn = (date: string): GridColumn => {
      const own = data.professionals?.find((column) => column.id === permissions.linkedProfessionalId);
      return {
        key: date,
        label: `${fmt.weekdayShort(date)}, ${fmt.shortDate(date)}`,
        date,
        professionalId: permissions.linkedProfessionalId ?? undefined,
        workingIntervals: own ? own.workingIntervals.filter((item) => item.date === date) : null,
        unitIntervals: hoursOf(date)?.intervals ?? [],
        closure: hoursOf(date)?.closure ?? null,
        isToday: date === today,
      };
    };
    if (state.view === "week") {
      const dates = Array.from({ length: 7 }, (_, index) => addDays(range.from, index));
      if (permissions.ownOnly) return dates.map(ownColumn);
      const list = state.by === "room" ? (data.rooms ?? []) : (data.professionals ?? []);
      const focus = list.find((item) => item.id === state.focusId) ?? list[0];
      if (!focus) return [];
      return dates.map((date) => ({
        key: date,
        label: `${fmt.weekdayShort(date)}, ${fmt.shortDate(date)}`,
        sublabel: focus.label,
        date,
        ...(state.by === "room" ? { roomId: focus.id } : { professionalId: focus.id }),
        workingIntervals:
          state.by === "room" ? null : focus.workingIntervals.filter((item) => item.date === date),
        unitIntervals: hoursOf(date)?.intervals ?? [],
        closure: hoursOf(date)?.closure ?? null,
        isToday: date === today,
      }));
    }
    if (permissions.ownOnly) return [ownColumn(state.date)];
    const list =
      state.by === "room"
        ? (data.rooms ?? [])
        : (data.professionals ?? []).filter(
            (column) => state.professionalIds.length === 0 || state.professionalIds.includes(column.id),
          );
    return list.map((column) => ({
      key: column.id,
      label: column.label,
      color: column.color,
      date: state.date,
      ...(state.by === "room" ? { roomId: column.id } : { professionalId: column.id }),
      workingIntervals:
        state.by === "room" ? null : column.workingIntervals.filter((item) => item.date === state.date),
      unitIntervals: hoursOf(state.date)?.intervals ?? [],
      closure: hoursOf(state.date)?.closure ?? null,
      isToday: state.date === today,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, state, range.from, today, permissions]);

  const columnOf = useCallback(
    (item: AgendaItem) => {
      if (state.view === "week" || permissions.ownOnly) {
        const date = localParts(item.startsAt, timeZone).date;
        const column = columns.find((entry) => entry.date === date);
        if (!column) return null;
        if (column.roomId && item.room?.id !== column.roomId) return null;
        if (column.professionalId && item.professional.id !== column.professionalId) return null;
        return column.key;
      }
      return state.by === "room" ? (item.room?.id ?? null) : item.professional.id;
    },
    [state.view, state.by, permissions.ownOnly, columns, timeZone],
  );

  function openAppointment(item: { id: string }, action?: "reschedule") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("appointment", item.id);
    if (action) params.set("action", action);
    else params.delete("action");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeAppointment() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("appointment");
    params.delete("action");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function step(direction: -1 | 1) {
    const days = state.view === "week" ? 7 : 1;
    update({ date: addDays(state.date, direction * days) });
  }

  function onSlot(column: GridColumn, minute: number) {
    if (!permissions.canManage) return;
    setBooking({
      date: column.date,
      startTime: formatMinute(minute),
      ...(column.professionalId ? { professionalId: column.professionalId } : {}),
      ...(column.roomId ? { roomId: column.roomId } : {}),
    });
  }

  function confirmDrop(override?: { overbooking: boolean; justification: string }) {
    if (!drop) return;
    const { item, column, minute } = drop;
    startTransition(async () => {
      const result = await actions.reschedule({
        appointmentId: item.id,
        version: item.version,
        date: column.date,
        startTime: formatMinute(minute),
        professionalId: column.professionalId ?? item.professional.id,
        roomId: column.roomId ?? item.room?.id ?? null,
        source: "DRAG",
        confirmOverbooking: override?.overbooking ?? false,
        exceptionJustification: override?.justification.trim() || null,
      });
      if (!result.ok) {
        const details = result.error.details as { findings?: FindingDto[] } | undefined;
        if (details?.findings) {
          setDrop({ ...drop, findings: details.findings });
          return;
        }
        handleActionResult(result);
        setDrop(null);
        void agenda.refresh();
        return;
      }
      toast.success(t("scheduling.ui.toasts.rescheduled"));
      setDrop(null);
      void agenda.refresh();
    });
  }

  function onResize(item: AgendaItem, durationMinutes: number) {
    startTransition(async () => {
      const result = await actions.update({ appointmentId: item.id, version: item.version, durationMinutes });
      if (!result.ok) {
        const details = result.error.details as { findings?: FindingDto[] } | undefined;
        const first = details?.findings?.[0];
        toast.error(first ? findingText(first) : result.error.message, {
          duration: Infinity,
          closeButton: true,
        });
      } else {
        toast.success(t("scheduling.ui.toasts.saved"));
      }
      void agenda.refresh();
    });
  }

  const dropLabel = drop
    ? t("scheduling.ui.rescheduleConfirm", {
        weekday: fmt.weekdayShort(drop.column.date),
        time: fmt.minute(drop.minute),
        professional:
          drop.column.professionalId && data?.professionals
            ? (data.professionals.find((column) => column.id === drop.column.professionalId)?.label ??
              drop.item.professional.displayName)
            : drop.item.professional.displayName,
      })
    : "";

  const pdfHref = (professionalId: string) =>
    `/api/schedule/agenda-pdf?${new URLSearchParams({ unitId, date: state.date, professionalId }).toString()}`;
  const count =
    state.view === "list"
      ? (props.list?.total ?? 0)
      : items.filter((item) => item.status !== "CANCELLED").length;

  return (
    <div className="grid gap-4" data-full-width>
      <PageHeader
        title={t("common.agenda")}
        meta={t("scheduling.ui.agendaMeta", {
          unit: props.unitName,
          range:
            state.view === "week"
              ? t("scheduling.ui.weekMeta", { from: fmt.shortDate(range.from), to: fmt.shortDate(range.to) })
              : fmt.longDate(state.date),
          count,
        })}
        actions={
          permissions.canManage ? (
            <Button type="button" onClick={() => setBooking({ date: state.date, startTime: "08:00" })}>
              <Plus />
              {t("scheduling.ui.bookAppointment")}
            </Button>
          ) : null
        }
      />
      <AgendaToolbar
        state={state}
        onChange={update}
        onStep={step}
        onToday={() => update({ date: today })}
        professionals={professionals}
        rooms={rooms}
        services={props.services.map((service) => ({ id: service.id, name: service.name }))}
        ownOnly={permissions.ownOnly}
        canManage={permissions.canManage}
        onAvailability={() => setAvailability(true)}
        pdfHref={pdfHref}
      />
      {state.view === "list" ? (
        <ListSection list={props.list} state={state} unitId={unitId} />
      ) : agenda.isError ? (
        <p className="text-muted-foreground">{t("scheduling.ui.agendaLoadError")}</p>
      ) : !data ? (
        <div className="bg-paper-2 h-96 rounded-md" aria-label={t("scheduling.ui.agendaLoading")} />
      ) : columns.length === 0 ? (
        <p className="text-muted-foreground">{t("scheduling.ui.noProfessionalsToday")}</p>
      ) : (
        <TimeGrid
          columns={columns}
          items={items}
          columnOf={columnOf}
          timeZone={timeZone}
          granularity={granularity}
          now={now}
          canBook={permissions.canManage}
          canDrag={permissions.canManage}
          onSlot={onSlot}
          onOpen={(item) => openAppointment(item)}
          onMove={(item, column, minute) => {
            setDropOverbooking(false);
            setDropJustification("");
            setDrop({ item, column, minute, findings: [] });
          }}
          onResize={onResize}
        />
      )}

      {booking ? (
        <BookingPanel
          draft={booking}
          unitId={unitId}
          currency={props.unitCurrency}
          country={props.unitCountry}
          granularity={granularity}
          services={props.services}
          canRegisterPatient={permissions.canRegisterPatient}
          patientForm={props.patientForm}
          actions={actions}
          packageSlot={props.packageSlot}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            void agenda.refresh();
            router.refresh();
          }}
        />
      ) : null}
      {opened ? (
        <AppointmentPanel
          key={opened.id}
          appointmentId={opened.id}
          {...(opened.action ? { initialAction: opened.action } : {})}
          granularity={granularity}
          country={props.unitCountry}
          services={props.services}
          reasons={props.reasons}
          permissions={permissions}
          actions={actions}
          chargeSection={props.chargeSection}
          packageSlot={props.packageSlot}
          onChanged={() => {
            void agenda.refresh();
            if (state.view === "list") router.refresh();
          }}
          onClose={closeAppointment}
        />
      ) : null}
      {permissions.canManage ? (
        <AvailabilityDialog
          open={availability}
          onOpenChange={setAvailability}
          unitId={unitId}
          services={props.services}
          professionals={professionals}
          onPick={(slot, serviceId) => {
            setAvailability(false);
            setBooking({
              date: slot.date,
              startTime: slot.startTime,
              professionalId: slot.professionalId,
              serviceId,
              ...(slot.roomId ? { roomId: slot.roomId } : {}),
            });
          }}
        />
      ) : null}
      <AlertDialog open={drop !== null} onOpenChange={(open) => !open && setDrop(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dropLabel}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("scheduling.ui.dropBody", { patient: drop?.item.patient.displayName ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {drop && drop.findings.length > 0 ? (
            <ConflictFindings
              findings={drop.findings}
              overbookingConfirmed={dropOverbooking}
              onConfirmOverbooking={() => setDropOverbooking(true)}
              justification={dropJustification}
              onJustification={setDropJustification}
            />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <Button
              type="button"
              disabled={
                pending ||
                (drop !== null &&
                  (hasBlocking(drop.findings) || (needsOverbooking(drop.findings) && !dropOverbooking)))
              }
              onClick={() => confirmDrop({ overbooking: dropOverbooking, justification: dropJustification })}
            >
              {pending ? t("scheduling.ui.rescheduling") : t("common.reschedule")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ListSection({
  list,
  state,
  unitId,
}: {
  list: AppointmentListData | null;
  state: ToolbarState;
  unitId: string;
}) {
  const t = useTranslations();
  if (!list) return <p className="text-muted-foreground">{t("scheduling.ui.listLoadError")}</p>;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (extra: Record<string, string>) => {
    const params = toParams(state);
    if (unitId !== "all") params.set("unit", unitId);
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
    return `?${params.toString()}`;
  };
  return (
    <div className="grid gap-3">
      <AppointmentsTable
        items={list.items}
        hrefOf={(item) => href({ page: String(list.page), appointment: item.id })}
        emptyText={t("scheduling.ui.noAppointmentsInPeriod")}
      />
      {pages > 1 ? (
        <nav aria-label={t("common.pagination")} className="flex items-center gap-3 text-sm">
          {list.page > 1 ? (
            <Link href={href({ page: String(list.page - 1) })} className="text-primary hover:underline">
              {t("common.previous")}
            </Link>
          ) : null}
          <span className="text-muted-foreground tabular-nums">
            {t("common.pageOf", { page: list.page, pages })}
          </span>
          {list.page < pages ? (
            <Link href={href({ page: String(list.page + 1) })} className="text-primary hover:underline">
              {t("common.next")}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

export type { AgendaBy, AgendaViewKind };
export type AgendaActions = BookingActions & AppointmentActions;
export type { ActionResult };
