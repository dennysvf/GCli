import { currencyOf } from "@/shared/kernel/countries/codes";
import type { Metadata } from "next";
import { getOrganizationProfile } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { patients } from "@/modules/patients";
import {
  AgendaView,
  APPOINTMENT_STATUSES,
  scheduling,
  type AgendaBy,
  type AgendaViewKind,
  type AppointmentStatus,
} from "@/modules/scheduling";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { can } from "@/shared/authz/permissions";
import { addDays, isValidDate } from "@/shared/kernel/calendar-date";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { savePatientAction } from "../patients/actions";
import { ChargeSlot } from "./charge-slot";
import {
  bookAppointmentAction,
  bookingOptionsAction,
  bookSeriesAction,
  cancelAppointmentAction,
  changeStatusAction,
  editSeriesAction,
  getAppointmentAction,
  previewSeriesAction,
  previewSeriesEditAction,
  rescheduleAppointmentAction,
  updateAppointmentAction,
} from "./actions";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("common.agenda") };
}

const LIST_DAYS = 30;

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
const ids = (value: string | string[] | undefined) =>
  (text(value) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

// The agenda (PRD F06). URL contract (also used by F04): ?view=day|week|list, date, unit, by,
// focus, professionals (or professional), services, statuses, from, to, page, appointment, action.
export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const t = await getTranslations();
  const ctx = await requirePermission("schedule:read-all", "schedule:read-own");
  const params = await searchParams;
  const ownOnly = !can(ctx, "schedule:read-all");
  const canManage = can(ctx, "schedule:manage");

  const [profile, activeUnits, selected] = await Promise.all([
    getOrganizationProfile(ctx),
    units.listUnits(ctx, { activeOnly: true }),
    units.getSelectedUnit(ctx),
  ]);
  const unitList = activeUnits.ok ? activeUnits.value : [];
  const requested = text(params.unit);
  const unit =
    unitList.find((item) => item.id === requested) ??
    (ownOnly && !requested
      ? null
      : (unitList.find((item) => item.id === selected?.id) ?? unitList[0] ?? null));
  const unitId = unit?.id ?? (ownOnly ? "all" : null);

  if (!unitId) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("common.agenda")} />
        <p className="text-muted-foreground">{t("scheduling.ui.noActiveUnit")}</p>
      </div>
    );
  }

  const timeZone = unit?.timeZone ?? (profile.ok ? profile.value.timeZone : "America/Sao_Paulo");
  const granularity = profile.ok ? profile.value.slotGranularityMinutes : 15;
  const today = dateInTimeZone(new Date(), timeZone);
  const requestedDate = text(params.date) ?? text(params.from);
  const date = requestedDate && isValidDate(requestedDate) ? requestedDate : today;
  const viewParam = text(params.view);
  const view: AgendaViewKind =
    viewParam === "week" || viewParam === "list" || viewParam === "day"
      ? viewParam
      : ownOnly
        ? "week"
        : "day";
  const by: AgendaBy = text(params.by) === "room" ? "room" : "professional";
  const professionalIds = [...ids(params.professionals), ...ids(params.professional)];
  const serviceIds = ids(params.services);
  const statuses = ids(params.statuses).filter((value): value is AppointmentStatus =>
    (APPOINTMENT_STATUSES as readonly string[]).includes(value),
  );
  const page = Math.max(1, Number(text(params.page) ?? 1) || 1);
  const appointmentId = text(params.appointment);

  const [activeServices, reasons, referralSources, tags, list] = await Promise.all([
    services.listActiveServices(ctx),
    canManage ? scheduling.listCancellationReasons(ctx, { activeOnly: true }) : null,
    canManage ? patients.listItems(ctx, "referral-source", { activeOnly: true }) : null,
    canManage ? patients.listItems(ctx, "tag", { activeOnly: true }) : null,
    view === "list"
      ? scheduling.listAppointments(ctx, {
          unitId,
          from: date,
          to: (() => {
            const to = text(params.to);
            return to && isValidDate(to) && to >= date ? to : addDays(date, LIST_DAYS);
          })(),
          ...(professionalIds.length ? { professionalIds } : {}),
          ...(serviceIds.length ? { serviceIds } : {}),
          ...(statuses.length ? { statuses } : {}),
          page,
        })
      : null,
  ]);

  return (
    <AgendaView
      key={`${unitId}-${view}`}
      unitId={unitId}
      unitName={unit?.name ?? t("scheduling.ui.allUnits")}
      unitCurrency={unit?.currency ?? currencyOf(ctx.organizationCountry)}
      unitCountry={unit?.country ?? ctx.organizationCountry}
      timeZone={timeZone}
      granularity={granularity}
      today={today}
      initial={{
        view,
        by,
        date,
        focusId: text(params.focus) ?? "",
        professionalIds,
        serviceIds,
        statuses,
      }}
      services={activeServices.ok ? activeServices.value : []}
      reasons={reasons?.ok ? reasons.value : []}
      permissions={{
        canManage,
        canRevertAnyTime: can(ctx, "schedule:revert-completion"),
        canOverride: can(ctx, "schedule:override-availability"),
        canRegisterPatient: can(ctx, "patient:manage"),
        linkedProfessionalId: ctx.linkedProfessionalId,
        ownOnly,
      }}
      list={list?.ok ? list.value : null}
      openAppointment={
        appointmentId
          ? {
              id: appointmentId,
              ...(text(params.action) === "reschedule" ? { action: "reschedule" as const } : {}),
            }
          : null
      }
      patientForm={{
        today,
        referralSources: referralSources?.ok ? referralSources.value : [],
        tags: tags?.ok ? tags.value : [],
        save: savePatientAction,
      }}
      chargeSection={can(ctx, "billing:operate") ? ChargeSlot : undefined}
      actions={{
        book: bookAppointmentAction,
        previewSeries: previewSeriesAction,
        bookSeries: bookSeriesAction,
        options: bookingOptionsAction,
        get: getAppointmentAction,
        changeStatus: changeStatusAction,
        cancel: cancelAppointmentAction,
        reschedule: rescheduleAppointmentAction,
        update: updateAppointmentAction,
        previewSeriesEdit: previewSeriesEditAction,
        editSeries: editSeriesAction,
      }}
    />
  );
}
