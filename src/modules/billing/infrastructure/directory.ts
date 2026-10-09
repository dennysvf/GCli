import { getOrganizationProfile, getUserNames, identity } from "@/modules/identity";
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import type { RequestContext } from "@/shared/context/types";
import { fail, ok } from "@/shared/kernel/result";
import type { BillingDirectory, ServiceInfo, UnitInfo } from "../application/ports";

// Reads the modules F09 consumes through their public APIs only (PRD F09 Consumes, architecture
// rule 5). A failed read (permission, not found) becomes "absent" and the use cases decide.
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

async function unitInfo(
  ctx: RequestContext,
  unit: {
    id: string;
    name: string;
    active: boolean;
    country: UnitInfo["country"];
    currency: UnitInfo["currency"];
    timeZone: string;
  },
): Promise<UnitInfo> {
  const contact = await units.getUnitContact(ctx, unit.id);
  return {
    id: unit.id,
    name: unit.name,
    country: unit.country,
    currency: unit.currency,
    timeZone: unit.timeZone,
    active: unit.active,
    formattedAddress: contact.ok ? contact.value.formattedAddress : null,
    phone: contact.ok ? contact.value.phone : null,
  };
}

function serviceInfo(service: {
  id: string;
  name: string;
  active: boolean;
  prices: { currency: string; amountMinor: number }[];
}): ServiceInfo {
  return { id: service.id, name: service.name, active: service.active, prices: service.prices };
}

export const billingDirectory: BillingDirectory = {
  async unit(ctx, unitId) {
    const listed = await units.listUnits(ctx, { activeOnly: false });
    const unit = listed.ok ? listed.value.find((item) => item.id === unitId) : undefined;
    return unit ? unitInfo(ctx, unit) : null;
  },

  async activeUnits(ctx) {
    const listed = await units.listUnits(ctx, { activeOnly: true });
    return listed.ok ? Promise.all(listed.value.map((unit) => unitInfo(ctx, unit))) : [];
  },

  async selectedUnitId(ctx) {
    const selected = await units.getSelectedUnit(ctx);
    return selected?.id ?? null;
  },

  async patient(ctx, patientId) {
    const found = await patients.getPatientIdentity(ctx, patientId);
    if (!found.ok) return fail(found.error);
    return ok({
      id: found.value.id,
      displayName: found.value.displayName,
      document: found.value.document
        ? { type: found.value.document.type, number: found.value.document.number }
        : null,
    });
  },

  async patientNames(ctx, patientIds) {
    const found = await patients.getPatientSummaries(ctx, patientIds);
    return new Map(found.ok ? found.value.map((patient) => [patient.id, patient.displayName]) : []);
  },

  async service(ctx, serviceId) {
    const found = await services.getServiceSummaries(ctx, [serviceId]);
    const service = found.ok ? found.value[0] : undefined;
    return service ? serviceInfo(service) : null;
  },

  async activeServices(ctx) {
    const listed = await services.listActiveServices(ctx);
    return listed.ok ? listed.value.map((service) => serviceInfo({ ...service, active: true })) : [];
  },

  async serviceNames(ctx, serviceIds) {
    const found = await services.getServiceSummaries(ctx, serviceIds);
    return new Map(found.ok ? found.value.map((service) => [service.id, service.name]) : []);
  },

  async professionalNames(ctx, professionalIds) {
    if (professionalIds.length === 0) return new Map();
    const found = await professionals.getProfessionals(ctx, { ids: professionalIds });
    return new Map(found.ok ? found.value.map((item) => [item.id, item.displayName]) : []);
  },

  async activeProfessionals(ctx) {
    const found = await professionals.getProfessionals(ctx, { activeOnly: true });
    return found.ok ? found.value.map((item) => ({ id: item.id, name: item.displayName })) : [];
  },

  userNames: (ctx, userIds) => getUserNames(ctx, userIds),

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
      logo: logo.ok && logo.value ? { data: Buffer.from(logo.value.body), format: "png" } : null,
    };
  },

  async approvers(ctx) {
    const listed = await identity.listApprovers(ctx);
    return listed.ok ? listed.value : [];
  },
};
