import { fail, ok, type Result } from "@/shared/kernel/result";
import { ClinicalErrors } from "./errors";

// Who may start a note (PRD F07 Capabilities), as pure rules; the use case loads the facts.

// PRD F07: Chegou, Em atendimento or Concluído.
export const NOTE_APPOINTMENT_STATUSES = ["CHECKED_IN", "IN_PROGRESS", "COMPLETED"] as const;

export function canStartEncounterNote(input: {
  appointmentStatus: string;
  appointmentProfessionalId: string;
  actorProfessionalId: string | null;
}): Result<void> {
  if (input.actorProfessionalId !== input.appointmentProfessionalId) {
    return fail(ClinicalErrors.notAppointmentProfessional());
  }
  if (!(NOTE_APPOINTMENT_STATUSES as readonly string[]).includes(input.appointmentStatus)) {
    return fail(ClinicalErrors.appointmentStatusInvalid());
  }
  return ok(undefined);
}

// PRD F07: standalone notes need a past appointment with the professional (one the patient
// attended: a no-show or a cancellation is not a clinical relationship, spec F07 section 3).
export function canStartStandaloneNote(hasAttendedPastAppointment: boolean): Result<void> {
  return hasAttendedPastAppointment ? ok(undefined) : fail(ClinicalErrors.standaloneNotAllowed());
}
