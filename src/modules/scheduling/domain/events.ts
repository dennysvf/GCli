import type { AppointmentProps } from "./appointment";
import type { AppointmentStatus, Transition } from "./status";

// Domain events of the scheduling module (architecture 5.4). They are published inside the
// transaction, so F09 (charge on check-in) and F10 (package debit on completion) commit or roll
// back together with the status change.

// Same shape as the event bus's DomainEvent; the domain may not import shared/events.
export type AppointmentEvent = { type: string; occurredAt: Date; payload: Record<string, unknown> };

export const SCHEDULING_EVENTS = {
  booked: "AppointmentBooked",
  updated: "AppointmentUpdated",
  rescheduled: "AppointmentRescheduled",
  confirmed: "AppointmentConfirmed",
  unconfirmed: "AppointmentUnconfirmed",
  checkedIn: "AppointmentCheckedIn",
  checkInUndone: "AppointmentCheckInUndone",
  started: "AppointmentStarted",
  completed: "AppointmentCompleted",
  completionReverted: "AppointmentCompletionReverted",
  markedNoShow: "AppointmentMarkedNoShow",
  cancelled: "AppointmentCancelled",
} as const;

export const TRANSITION_EVENTS: Record<Exclude<Transition, "CANCEL">, string> = {
  CONFIRM: SCHEDULING_EVENTS.confirmed,
  UNCONFIRM: SCHEDULING_EVENTS.unconfirmed,
  CHECK_IN: SCHEDULING_EVENTS.checkedIn,
  UNDO_CHECK_IN: SCHEDULING_EVENTS.checkInUndone,
  START: SCHEDULING_EVENTS.started,
  COMPLETE: SCHEDULING_EVENTS.completed,
  REVERT_COMPLETION: SCHEDULING_EVENTS.completionReverted,
  NO_SHOW: SCHEDULING_EVENTS.markedNoShow,
};

export type PackageLinkRequest = { packageId: string | null; mode: "STRICT" | "UP_TO_BALANCE" };

export type AppointmentEventPayload = {
  appointmentId: string;
  status: AppointmentStatus;
  previousStatus: AppointmentStatus | null;
  patientId: string;
  professionalId: string;
  serviceId: string;
  unitId: string;
  roomId: string | null;
  startsAt: string;
  endsAt: string;
  priceMinor: number;
  currency: string;
  actorUserId: string;
  packageLink?: PackageLinkRequest;
};

export function appointmentEvent(
  type: string,
  props: Readonly<AppointmentProps>,
  context: {
    previousStatus: AppointmentStatus | null;
    actorUserId: string;
    now: Date;
    // PRD F10: the package chosen when booking or editing. Scheduling only carries it; the
    // packages module reacts (a string links, null removes it, absent leaves the link as it is).
    packageLink?: PackageLinkRequest;
  },
): AppointmentEvent {
  const payload: AppointmentEventPayload = {
    appointmentId: props.id,
    status: props.status,
    previousStatus: context.previousStatus,
    patientId: props.patientId,
    professionalId: props.professionalId,
    serviceId: props.serviceId,
    unitId: props.unitId,
    roomId: props.roomId,
    startsAt: props.startsAt.toISOString(),
    endsAt: new Date(props.startsAt.getTime() + props.durationMinutes * 60_000).toISOString(),
    priceMinor: props.priceMinor,
    currency: props.currency,
    actorUserId: context.actorUserId,
    ...(context.packageLink ? { packageLink: context.packageLink } : {}),
  };
  return { type, occurredAt: context.now, payload };
}
