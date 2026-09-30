import type { ScheduledAppointments } from "../application/ports";

// Default until scheduling (F06) registers its implementation: there are no appointments yet.
export const noAppointments: ScheduledAppointments = {
  countFutureInRoom: async () => 0,
  countFutureInUnit: async () => 0,
  countInDateRange: async () => 0,
  countFutureOutsideHours: async () => 0,
};
