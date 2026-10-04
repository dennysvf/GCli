// Appointment status lifecycle (PRD F06 Capabilities, spec F06 section 3).
export const APPOINTMENT_STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return typeof value === "string" && (APPOINTMENT_STATUSES as readonly string[]).includes(value);
}

// ADR-026: cancelled and no-show appointments free the slot; every other status occupies it.
export function occupiesSlot(status: AppointmentStatus): boolean {
  return status !== "CANCELLED" && status !== "NO_SHOW";
}

// Before check-in an appointment can still be edited, rescheduled, cancelled or marked no-show.
export function isOpen(status: AppointmentStatus): boolean {
  return status === "SCHEDULED" || status === "CONFIRMED";
}

export type Transition =
  | "CONFIRM"
  | "UNCONFIRM"
  | "CHECK_IN"
  | "UNDO_CHECK_IN"
  | "START"
  | "COMPLETE"
  | "REVERT_COMPLETION"
  | "NO_SHOW"
  | "CANCEL";

// The only allowed moves. Agendado → Chegou is allowed for patients who arrive without confirming.
const TRANSITIONS: readonly { from: AppointmentStatus; to: AppointmentStatus; transition: Transition }[] = [
  { from: "SCHEDULED", to: "CONFIRMED", transition: "CONFIRM" },
  { from: "CONFIRMED", to: "SCHEDULED", transition: "UNCONFIRM" },
  { from: "SCHEDULED", to: "CHECKED_IN", transition: "CHECK_IN" },
  { from: "CONFIRMED", to: "CHECKED_IN", transition: "CHECK_IN" },
  { from: "CHECKED_IN", to: "CONFIRMED", transition: "UNDO_CHECK_IN" },
  { from: "CHECKED_IN", to: "IN_PROGRESS", transition: "START" },
  { from: "IN_PROGRESS", to: "COMPLETED", transition: "COMPLETE" },
  { from: "COMPLETED", to: "IN_PROGRESS", transition: "REVERT_COMPLETION" },
  { from: "SCHEDULED", to: "NO_SHOW", transition: "NO_SHOW" },
  { from: "CONFIRMED", to: "NO_SHOW", transition: "NO_SHOW" },
  { from: "SCHEDULED", to: "CANCELLED", transition: "CANCEL" },
  { from: "CONFIRMED", to: "CANCELLED", transition: "CANCEL" },
];

export function resolveTransition(from: AppointmentStatus, to: AppointmentStatus): Transition | null {
  return TRANSITIONS.find((item) => item.from === from && item.to === to)?.transition ?? null;
}

// Targets the user may pick from the current status (the panel's buttons).
export function nextStatuses(from: AppointmentStatus): AppointmentStatus[] {
  return TRANSITIONS.filter((item) => item.from === from && item.transition !== "CANCEL").map(
    (item) => item.to,
  );
}

// PRD F01 matrix: professionals change only "in progress" and "completed" on their own agenda,
// plus the 30-minute completion reversal (spec F06).
export const OWN_STATUS_TRANSITIONS: readonly Transition[] = ["START", "COMPLETE", "REVERT_COMPLETION"];
