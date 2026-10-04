import type { DateTimeRange } from "@/shared/kernel/date-time-range";
import type { AppointmentStatus } from "../status";

// Conflict model (spec F06 section 3, ADR-026). Each rule is a strategy that reports findings
// with a severity; the composition in check.ts serves saving, the preview, series and availability.

export type Severity = "BLOCKING" | "OVERBOOKABLE" | "EXCEPTION" | "WARNING";

export type FindingCode =
  | "SCHEDULING_PROFESSIONAL_CONFLICT"
  | "SCHEDULING_ROOM_CONFLICT"
  | "SCHEDULING_OUTSIDE_WORKING_HOURS"
  | "SCHEDULING_TIME_OFF"
  | "SCHEDULING_OUTSIDE_UNIT_HOURS"
  | "SCHEDULING_UNIT_CLOSED"
  | "SCHEDULING_PAST_START"
  | "SCHEDULING_PATIENT_OVERLAP";

export type Finding = {
  code: FindingCode;
  severity: Severity;
  // Raw values for the message placeholders (instants, names, minute intervals); the browser
  // formats them in the language of the user (ADR-028).
  params: Record<string, string | null>;
  range?: { startsAt: string; endsAt: string };
  appointmentId?: string;
};

// The booking being checked: a new appointment, an edit or a reschedule (appointmentId set).
export type Draft = {
  appointmentId?: string;
  unitId: string;
  professionalId: string;
  roomId: string | null;
  patientId: string;
  range: DateTimeRange;
};

export type ExistingAppointment = {
  id: string;
  professionalId: string;
  professionalName: string;
  roomId: string | null;
  patientId: string;
  range: DateTimeRange;
  status: AppointmentStatus;
};

export type LocalInterval = { start: number; end: number };

// Everything the strategies need, loaded once by the application layer. Working intervals and
// business hours are in minutes from midnight in the unit's time zone.
export type ConflictContext = {
  timeZone: string;
  now: Date;
  professionalName: string;
  roomName: string | null;
  // Appointments of the same professional, room or patient that may overlap the draft(s).
  appointments: ExistingAppointment[];
  // Working intervals of the professional in this unit, per local date (validity applied).
  workingIntervals: Map<string, LocalInterval[]>;
  timeOffs: { range: DateTimeRange; type: string }[];
  // Unit business hours per ISO weekday (closed days have no intervals).
  businessHours: Map<number, LocalInterval[]>;
  closures: { startsOn: string; endsOn: string; reason: string }[];
};

export type CheckOptions = {
  // schedule:override-availability (Manager, Administrator): exceptions become overridable.
  canOverrideAvailability: boolean;
  // Booking and rescheduling check the past; edits that keep the start do not.
  checkPastStart: boolean;
};
