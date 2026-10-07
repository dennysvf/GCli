import { getOrganizationProfile, getUserNames } from "@/modules/identity";
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { scheduling } from "@/modules/scheduling";
import type { ClinicalDirectory } from "../application/ports";

// The facts F07 consumes (PRD F07 Consumes), read through the public APIs of the other modules.
export const clinicalDirectory: ClinicalDirectory = {
  appointment: (organizationId, appointmentId) =>
    scheduling.getAppointmentForRecord(organizationId, appointmentId),

  appointments: (organizationId, ids) => scheduling.appointmentsForRecords(organizationId, ids),

  relation: (organizationId, professionalId, patientId, now) =>
    scheduling.professionalPatientRelation(organizationId, professionalId, patientId, now),

  async patient(ctx, patientId) {
    const identity = await patients.getPatientIdentity(ctx, patientId);
    return identity.ok ? { displayName: identity.value.displayName, age: identity.value.age } : null;
  },

  async professionalNames(ctx, ids) {
    if (ids.length === 0) return new Map();
    const listed = await professionals.getProfessionals(ctx, { ids });
    return new Map(listed.ok ? listed.value.map((person) => [person.id, person.displayName]) : []);
  },

  userNames: (ctx, ids) => getUserNames(ctx, ids),

  async organizationTimeZone(ctx) {
    const profile = await getOrganizationProfile(ctx);
    return profile.ok ? profile.value.timeZone : "America/Sao_Paulo";
  },
};
