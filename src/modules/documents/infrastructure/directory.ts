import { clinicalRecords } from "@/modules/clinical-records";
import {
  getOrganizationProfile,
  getUserNames,
  identity,
  listAdministratorContacts,
} from "@/modules/identity";
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { units } from "@/modules/units";
import { fail, ok } from "@/shared/kernel/result";
import type { DocumentsDirectory, UnitForDocument } from "../application/ports";

// Reads the modules F08 consumes through their public APIs only (PRD F08 Consumes, architecture
// rule 5). The patient read applies the F05 visibility policy; the clinical rule is F07's.

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

async function unitFor(
  ctx: Parameters<DocumentsDirectory["unit"]>[0],
  unit: { id: string; name: string; active: boolean; timeZone: string },
): Promise<UnitForDocument | null> {
  const contact = await units.getUnitContact(ctx, unit.id);
  if (!contact.ok) return null;
  return {
    id: unit.id,
    name: unit.name,
    active: unit.active,
    country: contact.value.country,
    timeZone: unit.timeZone,
    phone: contact.value.phone,
    formattedAddress: contact.value.formattedAddress,
  };
}

export const documentsDirectory: DocumentsDirectory = {
  async patient(ctx, patientId) {
    const found = await patients.getPatientIdentity(ctx, patientId);
    if (!found.ok) return fail(found.error);
    const value = found.value;
    return ok({
      id: value.id,
      displayName: value.displayName,
      birthDate: value.birthDate,
      document: value.document ? { type: value.document.type, number: value.document.number } : null,
      formattedAddress: value.formattedAddress,
    });
  },

  canAccessClinical: (ctx, patientId) => clinicalRecords.canAccessPatientRecords(ctx, patientId),

  async organization(ctx) {
    const [profile, logo] = await Promise.all([
      getOrganizationProfile(ctx),
      identity.getOrganizationLogo(ctx),
    ]);
    const value = profile.ok ? profile.value : null;
    return {
      name: value?.tradeName ?? value?.legalName ?? "",
      taxId: value?.taxId ?? null,
      country: value?.country ?? ctx.organizationCountry,
      defaultLocale: value?.defaultLocale ?? ctx.locale,
      timeZone: value?.timeZone ?? DEFAULT_TIME_ZONE,
      // The logo is stored as PNG (F01 logo processor).
      logo: logo.ok && logo.value ? { data: Buffer.from(logo.value.body), format: "png" } : null,
    };
  },

  async unit(ctx, unitId) {
    const listed = await units.listUnits(ctx, { activeOnly: false });
    const unit = listed.ok ? listed.value.find((item) => item.id === unitId) : undefined;
    return unit ? unitFor(ctx, unit) : null;
  },

  async units(ctx) {
    const listed = await units.listUnits(ctx, { activeOnly: true });
    if (!listed.ok) return [];
    const found = await Promise.all(listed.value.map((unit) => unitFor(ctx, unit)));
    return found.filter((unit): unit is UnitForDocument => unit !== null);
  },

  async selectedUnitId(ctx) {
    const selected = await units.getSelectedUnit(ctx);
    return selected?.id ?? null;
  },

  async professional(ctx, professionalId, country) {
    const found = await professionals.getProfessionalCredentials(ctx, professionalId, country);
    if (!found.ok) return null;
    return {
      id: professionalId,
      displayName: found.value.displayName,
      specialty: found.value.specialty,
      registration: found.value.registration?.formatted ?? null,
    };
  },

  async professionals(ctx) {
    const listed = await professionals.getProfessionals(ctx, {});
    return listed.ok ? listed.value.map(({ id, displayName, active }) => ({ id, displayName, active })) : [];
  },

  userNames: (ctx, userIds) => getUserNames(ctx, userIds),

  administrators: (ctx) => listAdministratorContacts(ctx),
};
