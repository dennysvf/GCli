import { clinicalRecords } from "@/modules/clinical-records";
import { documents } from "@/modules/documents";
import { getOrganizationProfile, getUserNames } from "@/modules/identity";
import { patients } from "@/modules/patients";
import { scheduling } from "@/modules/scheduling";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok } from "@/shared/kernel/result";
import { PrivacyErrors } from "../domain/errors";
import type { AnonymizationSteps, ClinicalGate, PatientGate, PrivacyDirectory } from "../application/ports";

// The facts F14 consumes, read through the public APIs of the modules that own them (PRD F14
// Consumes): the F05 patient visibility, the F07 records policy and audited note read, and the F01
// organization profile.

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

export const patientGate: PatientGate = {
  async patient(ctx, patientId) {
    const found = await patients.getPatientIdentity(ctx, patientId);
    if (!found.ok) {
      return fail(
        found.error.code === CommonErrors.forbidden().code ? found.error : PrivacyErrors.patientNotFound(),
      );
    }
    const value = found.value;
    return ok({
      id: value.id,
      fullName: value.fullName,
      displayName: value.displayName,
      active: value.active,
      anonymized: value.anonymized,
    });
  },
};

export const clinicalGate: ClinicalGate = {
  canAccess: (ctx, patientId) => clinicalRecords.canAccessPatientRecords(ctx, patientId),
  getNote: (ctx, noteId) => clinicalRecords.getNote(ctx, noteId),
};

// The anonymization asks each module that owns the data to change it, inside the same transaction.
export const anonymizationSteps: AnonymizationSteps = {
  anonymizePatient: (ctx, uow, input) => patients.anonymizePatientIn(ctx, uow, input),
  eraseDocuments: (ctx, uow, patientId) => documents.eraseNonClinicalUploadsIn(ctx, uow, patientId),
  clearAppointmentNotes: (ctx, uow, patientId) => scheduling.clearPatientNotesIn(ctx, uow, patientId),
};

export const privacyDirectory: PrivacyDirectory = {
  async organizationTimeZone(ctx) {
    const profile = await getOrganizationProfile(ctx);
    return profile.ok ? profile.value.timeZone : DEFAULT_TIME_ZONE;
  },
  userNames: (ctx, userIds) => getUserNames(ctx, userIds),
};
