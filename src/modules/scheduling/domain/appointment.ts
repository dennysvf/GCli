import type { Currency } from "@/shared/kernel/countries/codes";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import type { DomainError } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { withinUndoWindow } from "./agenda-time";
import { SchedulingErrors } from "./errors";
import { DURATION_MAX, DURATION_MIN, DURATION_STEP, NOTES_MAX } from "./limits";
import { isOpen, resolveTransition, type AppointmentStatus, type Transition } from "./status";

// The appointment aggregate (architecture section 4: rich module). Every change goes through a
// method that enforces the lifecycle of PRD F06; the repository persists the props together with
// the pending history rows (status changes and reschedules).

export const CANCELLATION_ORIGINS = ["PATIENT", "CLINIC", "PROFESSIONAL"] as const;
export type CancellationOrigin = (typeof CANCELLATION_ORIGINS)[number];

export const CANCELLATION_ORIGIN_LABELS: Record<CancellationOrigin, string> = {
  PATIENT: "Paciente",
  CLINIC: "Clínica",
  PROFESSIONAL: "Profissional",
};

export type RescheduleSource = "FORM" | "DRAG" | "SERIES";

export type Cancellation = {
  origin: CancellationOrigin;
  reasonId: string;
  note: string | null;
  cancelledAt: Date;
};

// Result of the conflict check accepted for this save (Encaixe and justified exceptions).
export type AvailabilityDecision = {
  isOverbooking: boolean;
  exceptionJustification: string | null;
  exceptionCodes: string[];
};

export type AppointmentProps = {
  id: string;
  unitId: string;
  professionalId: string;
  serviceId: string;
  patientId: string;
  roomId: string | null;
  startsAt: Date;
  durationMinutes: number;
  // The price snapshot in the currency of the unit at booking (PRD F16).
  priceMinor: number;
  currency: Currency;
  status: AppointmentStatus;
  statusChangedAt: Date;
  isOverbooking: boolean;
  exceptionJustification: string | null;
  exceptionCodes: string[];
  notes: string | null;
  seriesId: string | null;
  seriesIndex: number | null;
  cancellation: Cancellation | null;
  version: number;
};

export type StatusChange = {
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  changedAt: Date;
  changedById: string;
  justification: string | null;
};

export type RescheduleRecord = {
  previousStartsAt: Date;
  previousEndsAt: Date;
  previousProfessionalId: string;
  previousRoomId: string | null;
  previousStatus: AppointmentStatus;
  source: RescheduleSource;
  rescheduledAt: Date;
  rescheduledById: string;
};

// Who acts, for the time-window rules. Authorization itself happens in the use case.
export type Actor = {
  userId: string;
  // The user is the appointment's professional (linked profile).
  isOwnProfessional: boolean;
  // schedule:revert-completion (Manager, Administrator).
  canRevertAnyTime: boolean;
};

export function validateDuration(minutes: number): DomainError | null {
  const valid =
    Number.isInteger(minutes) &&
    minutes >= DURATION_MIN &&
    minutes <= DURATION_MAX &&
    minutes % DURATION_STEP === 0;
  return valid
    ? null
    : SchedulingErrors.validation({
        durationMinutes: "scheduling.validation.duration",
      });
}

function validateNotes(notes: string | null): DomainError | null {
  return notes !== null && notes.length > NOTES_MAX
    ? SchedulingErrors.validation({ notes: "scheduling.validation.notesTooLong" })
    : null;
}

export type BookInput = Omit<
  AppointmentProps,
  | "status"
  | "statusChangedAt"
  | "cancellation"
  | "version"
  | "isOverbooking"
  | "exceptionJustification"
  | "exceptionCodes"
> & { decision: AvailabilityDecision; actorId: string; now: Date };

export class Appointment {
  readonly pendingStatusChanges: StatusChange[] = [];
  readonly pendingReschedules: RescheduleRecord[] = [];

  private constructor(
    private props: AppointmentProps,
    readonly isNew: boolean,
  ) {}

  static book(input: BookInput): Result<Appointment> {
    const problem = validateDuration(input.durationMinutes) ?? validateNotes(input.notes);
    if (problem) return fail(problem);
    const { decision, actorId, now, ...fields } = input;
    const appointment = new Appointment(
      {
        ...fields,
        status: "SCHEDULED",
        statusChangedAt: now,
        isOverbooking: decision.isOverbooking,
        exceptionJustification: decision.exceptionJustification,
        exceptionCodes: decision.exceptionCodes,
        cancellation: null,
        version: 1,
      },
      true,
    );
    appointment.pendingStatusChanges.push({
      fromStatus: null,
      toStatus: "SCHEDULED",
      changedAt: now,
      changedById: actorId,
      justification: null,
    });
    return ok(appointment);
  }

  static restore(props: AppointmentProps): Appointment {
    return new Appointment({ ...props }, false);
  }

  get snapshot(): Readonly<AppointmentProps> {
    return this.props;
  }

  get id(): string {
    return this.props.id;
  }

  get status(): AppointmentStatus {
    return this.props.status;
  }

  get endsAt(): Date {
    return new Date(this.props.startsAt.getTime() + this.props.durationMinutes * 60_000);
  }

  get range(): DateTimeRange {
    return DateTimeRange.ofMinutes(this.props.startsAt, this.props.durationMinutes);
  }

  private recordStatus(to: AppointmentStatus, now: Date, actorId: string, justification: string | null) {
    this.pendingStatusChanges.push({
      fromStatus: this.props.status,
      toStatus: to,
      changedAt: now,
      changedById: actorId,
      justification,
    });
    this.props = { ...this.props, status: to, statusChangedAt: now };
  }

  // Every status change except cancellation (which needs origin and reason).
  transition(
    to: AppointmentStatus,
    context: { now: Date; actor: Actor; justification: string | null },
  ): Result<Transition> {
    const transition = resolveTransition(this.props.status, to);
    if (!transition || transition === "CANCEL") {
      return fail(SchedulingErrors.invalidTransition(this.props.status, to));
    }
    const { now, actor } = context;
    let justification: string | null = null;
    switch (transition) {
      case "NO_SHOW":
        // PRD F06: no-show only after the appointment's start time.
        if (now < this.props.startsAt) return fail(SchedulingErrors.noShowTooEarly());
        break;
      case "UNDO_CHECK_IN":
        // PRD F06: Chegou → Confirmado within 30 minutes of the check-in.
        if (!withinUndoWindow(this.props.statusChangedAt, now)) return fail(SchedulingErrors.undoExpired());
        break;
      case "REVERT_COMPLETION": {
        // Spec F06 (ADR-026): the professional within 30 minutes; Manager/Administrator any time
        // with a justification.
        if (actor.isOwnProfessional && withinUndoWindow(this.props.statusChangedAt, now)) break;
        if (!actor.canRevertAnyTime) return fail(SchedulingErrors.undoExpired());
        const text = context.justification?.trim() ?? "";
        if (text.length === 0) {
          return fail({
            ...SchedulingErrors.justificationRequired(),
            fields: { justification: "scheduling.validation.reversalJustificationRequired" },
          });
        }
        justification = text;
        break;
      }
      default:
        break;
    }
    this.recordStatus(to, now, actor.userId, justification);
    return ok(transition);
  }

  cancel(input: {
    origin: CancellationOrigin;
    reasonId: string;
    note: string | null;
    now: Date;
    actorId: string;
  }): Result<void> {
    if (!isOpen(this.props.status)) {
      return fail(SchedulingErrors.invalidTransition(this.props.status, "CANCELLED"));
    }
    this.recordStatus("CANCELLED", input.now, input.actorId, null);
    this.props = {
      ...this.props,
      cancellation: {
        origin: input.origin,
        reasonId: input.reasonId,
        note: input.note,
        cancelledAt: input.now,
      },
    };
    return ok(undefined);
  }

  // PRD F06: same record, previous values in history, status back to Agendado.
  reschedule(input: {
    startsAt: Date;
    professionalId: string;
    roomId: string | null;
    decision: AvailabilityDecision;
    source: RescheduleSource;
    now: Date;
    actorId: string;
  }): Result<void> {
    if (!isOpen(this.props.status)) return fail(SchedulingErrors.notEditable());
    this.pendingReschedules.push({
      previousStartsAt: this.props.startsAt,
      previousEndsAt: this.endsAt,
      previousProfessionalId: this.props.professionalId,
      previousRoomId: this.props.roomId,
      previousStatus: this.props.status,
      source: input.source,
      rescheduledAt: input.now,
      rescheduledById: input.actorId,
    });
    if (this.props.status !== "SCHEDULED") this.recordStatus("SCHEDULED", input.now, input.actorId, null);
    this.props = {
      ...this.props,
      startsAt: input.startsAt,
      professionalId: input.professionalId,
      roomId: input.roomId,
      ...this.decisionProps(input.decision),
    };
    return ok(undefined);
  }

  // Spec F06: service, duration, room and notes change only before check-in. A new service takes
  // a new price snapshot (passed by the use case); duration alone keeps the price.
  edit(input: {
    serviceId?: string;
    priceMinor?: number;
    currency?: Currency;
    durationMinutes?: number;
    roomId?: string | null;
    notes?: string | null;
    decision?: AvailabilityDecision;
  }): Result<void> {
    if (!isOpen(this.props.status)) return fail(SchedulingErrors.notEditable());
    const problem =
      (input.durationMinutes !== undefined ? validateDuration(input.durationMinutes) : null) ??
      (input.notes !== undefined ? validateNotes(input.notes) : null);
    if (problem) return fail(problem);
    this.props = {
      ...this.props,
      ...(input.serviceId !== undefined ? { serviceId: input.serviceId } : {}),
      ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.roomId !== undefined ? { roomId: input.roomId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.decision ? this.decisionProps(input.decision) : {}),
    };
    return ok(undefined);
  }

  // Series split: the occurrence moves to the new series.
  moveToSeries(seriesId: string, seriesIndex: number): void {
    this.props = { ...this.props, seriesId, seriesIndex };
  }

  private decisionProps(decision: AvailabilityDecision) {
    return {
      isOverbooking: decision.isOverbooking,
      exceptionJustification: decision.exceptionJustification,
      exceptionCodes: decision.exceptionCodes,
    };
  }
}
