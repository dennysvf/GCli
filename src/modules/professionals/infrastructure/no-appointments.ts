import type { ProfessionalAppointments } from "../application/ports";

// Default until scheduling (F06) registers its implementation: no appointments exist yet.
export const noProfessionalAppointments: ProfessionalAppointments = {
  countFuture: async () => 0,
  countFutureForServices: async () => 0,
  listInPeriod: async () => [],
};
