// Public API of the scheduling module (spec F06 section 5).
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import type { RequestContext } from "@/shared/context/types";
import { exportDailyAgenda } from "./application/agenda-pdf";
import { bookAppointment } from "./application/book-appointment";
import { getBookingOptions } from "./application/booking-options";
import { cancelAppointment } from "./application/cancel-appointment";
import {
  createCancellationReason,
  listCancellationReasons,
  renameCancellationReason,
  setCancellationReasonActive,
} from "./application/cancellation-reasons";
import { changeAppointmentStatus } from "./application/change-status";
import { previewConflicts } from "./application/check-conflicts";
import { findNextAvailableSlots } from "./application/find-available-slots";
import type { SchedulingDeps } from "./application/ports";
import { getAgenda, getAppointment, listAppointments, listPatientAppointments } from "./application/queries";
import { rescheduleAppointment } from "./application/reschedule-appointment";
import { bookSeries, editSeries, previewSeries, previewSeriesEdit } from "./application/series";
import { updateAppointment } from "./application/update-appointment";
import { reactPdfAgendaRenderer } from "./infrastructure/agenda-pdf";
import { schedulingDirectory } from "./infrastructure/directory";
import { prismaAppointmentRepository } from "./infrastructure/prisma-appointment-repository";
import { prismaSeriesRepository } from "./infrastructure/prisma-series-repository";
import {
  patientsAppointments,
  professionalsAppointments,
  servicesAppointments,
  unitsAppointments,
} from "./infrastructure/ports";

const deps: SchedulingDeps = {
  appointments: prismaAppointmentRepository,
  series: prismaSeriesRepository,
  directory: schedulingDirectory,
  pdf: reactPdfAgendaRenderer,
  clock: () => new Date(),
};

export const scheduling = {
  // Booking and changes
  bookAppointment: (ctx: RequestContext, input: unknown) => bookAppointment(deps, ctx, input),
  updateAppointment: (ctx: RequestContext, input: unknown) => updateAppointment(deps, ctx, input),
  rescheduleAppointment: (ctx: RequestContext, input: unknown) => rescheduleAppointment(deps, ctx, input),
  changeAppointmentStatus: (ctx: RequestContext, input: unknown) => changeAppointmentStatus(deps, ctx, input),
  cancelAppointment: (ctx: RequestContext, input: unknown) => cancelAppointment(deps, ctx, input),
  // Recurring series
  previewSeries: (ctx: RequestContext, input: unknown) => previewSeries(deps, ctx, input),
  bookSeries: (ctx: RequestContext, input: unknown) => bookSeries(deps, ctx, input),
  previewSeriesEdit: (ctx: RequestContext, input: unknown) => previewSeriesEdit(deps, ctx, input),
  editSeries: (ctx: RequestContext, input: unknown) => editSeries(deps, ctx, input),
  // Agenda reads
  getAgenda: (ctx: RequestContext, input: unknown) => getAgenda(deps, ctx, input),
  listAppointments: (ctx: RequestContext, input: unknown) => listAppointments(deps, ctx, input),
  getAppointment: (ctx: RequestContext, appointmentId: string) => getAppointment(deps, ctx, appointmentId),
  listPatientAppointments: (ctx: RequestContext, patientId: string, page?: number) =>
    listPatientAppointments(deps, ctx, patientId, page),
  previewConflicts: (ctx: RequestContext, input: unknown) => previewConflicts(deps, ctx, input),
  getBookingOptions: (ctx: RequestContext, input: unknown) => getBookingOptions(deps, ctx, input),
  findNextAvailableSlots: (ctx: RequestContext, input: unknown) => findNextAvailableSlots(deps, ctx, input),
  exportDailyAgenda: (ctx: RequestContext, input: unknown) => exportDailyAgenda(deps, ctx, input),
  // Cancellation reasons
  listCancellationReasons: (ctx: RequestContext, options?: { activeOnly?: boolean }) =>
    listCancellationReasons(ctx, options),
  createCancellationReason: (ctx: RequestContext, input: unknown) => createCancellationReason(ctx, input),
  renameCancellationReason: (ctx: RequestContext, input: unknown) => renameCancellationReason(ctx, input),
  setCancellationReasonActive: (ctx: RequestContext, input: unknown) =>
    setCancellationReasonActive(ctx, input),
};

// Appointment ports of F02, F03, F04 and F05, registered once per process by src/composition.ts.
export function registerSchedulingPorts(): void {
  units.registerScheduledAppointments(unitsAppointments);
  services.registerScheduledServiceAppointments(servicesAppointments);
  professionals.registerProfessionalAppointments(professionalsAppointments);
  patients.registerPatientAppointments(patientsAppointments);
}

export { SCHEDULING_EVENTS, type AppointmentEventPayload } from "./domain/events";
export { APPOINTMENT_STATUSES, nextStatuses, STATUS_LABELS, type AppointmentStatus } from "./domain/status";
export {
  CANCELLATION_ORIGIN_LABELS,
  CANCELLATION_ORIGINS,
  type CancellationOrigin,
} from "./domain/appointment";
export { LIST_PAGE_SIZE, POLLING_INTERVAL_MS } from "./domain/limits";
export { SERIES_SCOPES, type SeriesScope } from "./application/schemas";
export type {
  Agenda,
  AgendaColumn,
  AgendaItem,
  AppointmentDetails,
  AppointmentList,
} from "./application/queries";
export type { BookResult } from "./application/book-appointment";
export type { BookingOptions } from "./application/booking-options";
export type { FindingDto } from "./application/booking";
export type { SeriesPreview, OccurrencePreview } from "./application/series";
export type { CancellationReasonItem } from "./application/cancellation-reasons";
export type { AvailableSlotDto } from "./application/find-available-slots";
export { schedulingMessages, findingMessages, SCHEDULING_LABELS, SCHEDULING_TOASTS } from "./messages";
export { AgendaView, type AgendaActions, type AgendaViewProps } from "./ui/agenda-view";
export type { AgendaBy, AgendaViewKind, ToolbarState } from "./ui/agenda-toolbar";
export type { ServiceOption, PatientFormData } from "./ui/booking-panel";
export { AppointmentsTable } from "./ui/appointments-table";
export { CancellationReasonsPanel } from "./ui/cancellation-reasons-panel";
