import type { PatientAppointments } from "../application/ports";

// Default until scheduling (F06) registers its implementation: no appointments exist yet.
export const noPatientAppointments: PatientAppointments = {
  countFuture: async () => 0,
  lastAppointmentDates: async () => new Map(),
  hasAppointmentWith: async () => false,
  patientIdsFor: async () => [],
};
