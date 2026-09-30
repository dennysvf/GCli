// Future appointments of a service, provided by scheduling (F06). Until F06 exists the default
// answers 0, so the deactivation warning is already in place (spec F03 section 3, ADR-007).
export interface ScheduledServiceAppointments {
  countFuture(organizationId: string, serviceId: string, now: Date): Promise<number>;
}

// Professionals enabled for each service, provided by F04. Services missing from the map have 0.
export interface ServiceProfessionals {
  countByService(organizationId: string, serviceIds: string[]): Promise<Map<string, number>>;
}

export type ServicesDeps = {
  appointments: () => ScheduledServiceAppointments;
  professionals: () => ServiceProfessionals;
  clock: () => Date;
};
