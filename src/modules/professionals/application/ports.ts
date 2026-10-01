import type { RequestContext } from "@/shared/context/types";
import type { BusinessDay } from "../domain/working-hours";

// An appointment hit by a new time-off, listed so the user can reschedule it (PRD F04 Experience).
export type AffectedAppointment = {
  appointmentId: string;
  startsAt: string;
  unitName: string;
  serviceName: string;
  patientName: string;
};

// Appointments of a professional, provided by scheduling (F06). Until F06 exists the default
// answers 0 or an empty list, so the rules that depend on it are already in place (ADR-007).
// "Future" means starting after `now` and not cancelled.
export interface ProfessionalAppointments {
  countFuture(organizationId: string, professionalId: string, now: Date): Promise<number>;
  countFutureForServices(
    organizationId: string,
    professionalId: string,
    serviceIds: string[],
    now: Date,
  ): Promise<number>;
  listInPeriod(
    organizationId: string,
    professionalId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<AffectedAppointment[]>;
}

// Read models from other modules' public APIs (units F02, services F03, identity F01). The module
// index wires them, so use cases stay free of cross-module imports.
export type UnitInfo = {
  id: string;
  name: string;
  timeZone: string;
  active: boolean;
  businessHours: BusinessDay[];
};

export interface UnitDirectory {
  listUnits(ctx: RequestContext, options: { activeOnly: boolean }): Promise<UnitInfo[]>;
}

export type ServiceInfo = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  durationMinutes: number;
  priceCents: number;
  color: string;
};

export interface ServiceDirectory {
  listActiveServices(ctx: RequestContext): Promise<ServiceInfo[]>;
  namesOf(ctx: RequestContext, serviceIds: string[]): Promise<Map<string, string>>;
}

export type LinkableUserInfo = { id: string; name: string; email: string; role: string };

export interface UserDirectory {
  listLinkableUsers(ctx: RequestContext): Promise<LinkableUserInfo[]>;
  namesOf(ctx: RequestContext, userIds: string[]): Promise<Map<string, string>>;
}

export type ProfessionalsDeps = {
  appointments: () => ProfessionalAppointments;
  units: UnitDirectory;
  services: ServiceDirectory;
  users: UserDirectory;
  organizationTimeZone: (ctx: RequestContext) => Promise<string>;
  clock: () => Date;
};
