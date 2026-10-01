// Public API of the patients module (spec F05 section 5).
import { getOrganizationProfile, getUserNames } from "@/modules/identity";
import type { RequestContext } from "@/shared/context/types";
import { definePort } from "@/shared/ports/registry";
import { getConsentFileUrl, listConsents, recordConsent, storeConsentFile } from "./application/consents";
import { createListItem, listItems, renameListItem, setListItemActive } from "./application/lists";
import { createPatient, getPatient, setPatientActive, updatePatient } from "./application/patients";
import type { PatientAppointments, PatientsDeps } from "./application/ports";
import { getPatientIdentity, getPatientRecord } from "./application/provided";
import type { ListKind } from "./application/schemas";
import { searchPatients } from "./application/search";
import { getCurrentTerms, listTermsVersions, publishTermsVersion } from "./application/terms";
import { noPatientAppointments } from "./infrastructure/no-appointments";
import { objectFileStore } from "./infrastructure/object-file-store";

const patientAppointments = definePort<PatientAppointments>(
  "patients.PatientAppointments",
  noPatientAppointments,
);

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const deps: PatientsDeps = {
  appointments: () => patientAppointments.get(),
  files: objectFileStore,
  userNames: (ctx, userIds) => getUserNames(ctx, userIds),
  async organizationTimeZone(ctx) {
    const profile = await getOrganizationProfile(ctx);
    return profile.ok ? profile.value.timeZone : DEFAULT_TIME_ZONE;
  },
  clock: () => new Date(),
};

export const patients = {
  // Patients
  getPatient: (ctx: RequestContext, patientId: string) => getPatient(deps, ctx, patientId),
  createPatient: (ctx: RequestContext, input: unknown) => createPatient(deps, ctx, input),
  updatePatient: (ctx: RequestContext, input: unknown) => updatePatient(deps, ctx, input),
  setPatientActive: (ctx: RequestContext, input: unknown) => setPatientActive(deps, ctx, input),
  searchPatients: (ctx: RequestContext, input: unknown) => searchPatients(deps, ctx, input),
  // Configurable lists
  listItems: (ctx: RequestContext, list: ListKind, options?: { activeOnly?: boolean }) =>
    listItems(ctx, list, options),
  createListItem: (ctx: RequestContext, input: unknown) => createListItem(ctx, input),
  renameListItem: (ctx: RequestContext, input: unknown) => renameListItem(ctx, input),
  setListItemActive: (ctx: RequestContext, input: unknown) => setListItemActive(ctx, input),
  // Privacy terms and consent
  listTermsVersions: (ctx: RequestContext) => listTermsVersions(deps, ctx),
  getCurrentTerms: (ctx: RequestContext) => getCurrentTerms(ctx),
  publishTermsVersion: (ctx: RequestContext, input: unknown) => publishTermsVersion(ctx, input),
  listConsents: (ctx: RequestContext, patientId: string) => listConsents(deps, ctx, patientId),
  recordConsent: (ctx: RequestContext, input: unknown) => recordConsent(deps, ctx, input),
  storeConsentFile: (ctx: RequestContext, file: { bytes: Uint8Array; name: string }) =>
    storeConsentFile(deps, ctx, file),
  getConsentFileUrl: (ctx: RequestContext, consentId: string) => getConsentFileUrl(deps, ctx, consentId),
  // Provided to F06, F08, F10 (identity) and F12, F14 (complete record)
  getPatientIdentity: (ctx: RequestContext, patientId: string) => getPatientIdentity(deps, ctx, patientId),
  getPatientRecord: (ctx: RequestContext, patientId: string) => getPatientRecord(deps, ctx, patientId),
  // Extension point for scheduling (F06); null restores the inert default (ADR-022).
  registerPatientAppointments: (implementation: PatientAppointments | null) =>
    patientAppointments.register(implementation),
};

export type { PatientAppointments } from "./application/ports";
export type { CreatePatientResult, DuplicateCandidate, PatientDetails } from "./application/patients";
export type { PatientSearchItem, PatientSearchResult } from "./application/search";
export type { ConsentItem } from "./application/consents";
export type { ListItem } from "./application/lists";
export type { TermsVersion } from "./application/terms";
export type { PatientIdentity, PatientRecord } from "./application/provided";
export { LIST_KINDS, PATIENT_STATUSES, type ListKind, type PatientStatusFilter } from "./application/schemas";
export {
  patientsMessages,
  PATIENTS_INCOMPLETE_RECORD,
  PATIENTS_NOT_VISIBLE,
  PATIENTS_POSSIBLE_DUPLICATE,
  PATIENTS_TERMS_PUBLISHED,
} from "./messages";
