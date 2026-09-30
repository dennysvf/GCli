import type { ScheduledServiceAppointments, ServiceProfessionals } from "../application/ports";

// Defaults until scheduling (F06) and professionals (F04) register their implementations.
export const noServiceAppointments: ScheduledServiceAppointments = {
  countFuture: async () => 0,
};

export const noServiceProfessionals: ServiceProfessionals = {
  countByService: async () => new Map(),
};
