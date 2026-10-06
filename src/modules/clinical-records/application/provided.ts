import type { ClinicalNoteLookup } from "@/modules/scheduling";
import type { ClinicalRecordsDeps } from "./ports";

// The port scheduling declares (F06, ADR-022): the state of each appointment's note, never its
// content, so the agenda can offer "Abrir prontuário" and remind the professional after Concluído.
export function createClinicalNoteLookup(deps: ClinicalRecordsDeps): ClinicalNoteLookup {
  return {
    noteStates: (organizationId, appointmentIds, viewerUserId) =>
      appointmentIds.length === 0
        ? Promise.resolve(new Map())
        : deps.notes.statesForAppointments(organizationId, appointmentIds, viewerUserId, deps.clock()),
  };
}
