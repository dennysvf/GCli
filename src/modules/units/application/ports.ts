import type { Week } from "../domain/business-hours";

// Future appointments, provided by scheduling (F06). Until F06 exists the default implementation
// answers 0, so the rules that depend on it are already in place (spec F02 section 3, ADR-007).
export interface ScheduledAppointments {
  countFutureInRoom(organizationId: string, roomId: string, now: Date): Promise<number>;
  countFutureInUnit(organizationId: string, unitId: string, now: Date): Promise<number>;
  // Appointments on the unit between two calendar dates (inclusive), in the unit's time zone.
  countInDateRange(organizationId: string, unitId: string, startsOn: string, endsOn: string): Promise<number>;
  // Future appointments that would fall outside the given weekly hours.
  countFutureOutsideHours(organizationId: string, unitId: string, week: Week, now: Date): Promise<number>;
}

export type UnitsDeps = {
  appointments: () => ScheduledAppointments;
  clock: () => Date;
};
