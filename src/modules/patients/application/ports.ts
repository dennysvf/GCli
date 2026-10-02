import type { RequestContext } from "@/shared/context/types";

// Appointments of patients, provided by scheduling (F06). Until F06 exists the default answers
// "no appointments" (spec F05 section 3, ADR-007): professionals see no patients, deactivation is
// never blocked and the last appointment date is empty.
export interface PatientAppointments {
  countFuture(organizationId: string, patientId: string, now: Date): Promise<number>;
  // ISO date-time of each patient's most recent appointment; patients without one are absent.
  lastAppointmentDates(organizationId: string, patientIds: string[]): Promise<Map<string, string>>;
  hasAppointmentWith(organizationId: string, professionalId: string, patientId: string): Promise<boolean>;
  patientIdsFor(organizationId: string, professionalId: string): Promise<string[]>;
}

// Private object storage for signed consent terms (ADR-023).
export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  head(key: string): Promise<{ size: number; contentType: string | undefined } | null>;
  presignGet(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export type PatientsDeps = {
  appointments: () => PatientAppointments;
  files: FileStore;
  userNames: (ctx: RequestContext, userIds: string[]) => Promise<Map<string, string>>;
  organizationTimeZone: (ctx: RequestContext) => Promise<string>;
  clock: () => Date;
};
