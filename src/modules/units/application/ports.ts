import type { Week } from "../domain/business-hours";

// Future appointments, provided by scheduling (F06). Until F06 exists the default implementation
// answers 0, so the rules that depend on it are already in place (spec F02 section 3, ADR-007).
export interface ScheduledAppointments {
  countFutureInRoom(organizationId: string, roomId: string, now: Date): Promise<number>;
  countFutureInUnit(organizationId: string, unitId: string, now: Date): Promise<number>;
  // Appointments on the unit between two calendar dates (inclusive), in the unit's time zone.
  countInDateRange(
    organizationId: string,
    unitId: string,
    startsOn: string,
    endsOn: string,
    timeZone: string,
  ): Promise<number>;
  // Whether the unit has any appointment at all; its country cannot change afterwards (PRD F16).
  // F09 and F11 will add their charges and cash registers to this rule.
  hasAnyInUnit(organizationId: string, unitId: string): Promise<boolean>;
  // Future appointments that would fall outside the given weekly hours (local to the unit).
  countFutureOutsideHours(
    organizationId: string,
    unitId: string,
    week: Week,
    now: Date,
    timeZone: string,
  ): Promise<number>;
}

// Active services without a price in a currency, provided by services (F03) so units can warn
// when a unit brings a currency the catalog does not price yet (PRD F16).
export interface ServicePricing {
  servicesWithoutPrice(organizationId: string, currency: string): Promise<{ id: string; name: string }[]>;
}

export type UnitsDeps = {
  appointments: () => ScheduledAppointments;
  pricing: () => ServicePricing;
  clock: () => Date;
};
