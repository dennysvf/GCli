import type { RequestContext } from "@/shared/context/types";
import type { RoomRef } from "../domain/service-rules";

// Future appointments of a service, provided by scheduling (F06). Until F06 exists the default
// answers 0, so the deactivation warning is already in place (spec F03 section 3, ADR-007).
export interface ScheduledServiceAppointments {
  countFuture(organizationId: string, serviceId: string, now: Date): Promise<number>;
}

// Professionals enabled for each service, provided by F04. Services missing from the map have 0.
export interface ServiceProfessionals {
  countByService(organizationId: string, serviceIds: string[]): Promise<Map<string, number>>;
}

// Rooms and author names come from other modules' public APIs (units F02, identity F01); the
// module index wires them, so use cases stay free of cross-module imports.
export interface RoomDirectory {
  findRooms(ctx: RequestContext, roomIds: string[]): Promise<RoomRef[]>;
}

export interface UserNames {
  namesOf(ctx: RequestContext, userIds: string[]): Promise<Map<string, string>>;
}

export type ServicesDeps = {
  rooms: RoomDirectory;
  users: UserNames;
  appointments: () => ScheduledServiceAppointments;
  professionals: () => ServiceProfessionals;
  clock: () => Date;
};
