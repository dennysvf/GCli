import { getUserNames, identity } from "@/modules/identity";
import { patients } from "@/modules/patients";
import { scheduling } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { fail, ok } from "@/shared/kernel/result";
import type { LinkedAppointmentInfo, PackagesDirectory, ServiceInfo, UnitInfo } from "../application/ports";

// Reads the modules F10 consumes through their public APIs only (PRD F10 Consumes, architecture
// rule 5). A failed read (permission, not found) becomes "absent" and the use cases decide.
function serviceInfo(service: {
  id: string;
  name: string;
  active: boolean;
  prices: { currency: string; amountMinor: number }[];
}): ServiceInfo {
  return { id: service.id, name: service.name, active: service.active, prices: service.prices };
}

function unitInfo(unit: {
  id: string;
  name: string;
  country: UnitInfo["country"];
  currency: UnitInfo["currency"];
  timeZone: string;
  active: boolean;
}): UnitInfo {
  return {
    id: unit.id,
    name: unit.name,
    country: unit.country,
    currency: unit.currency,
    timeZone: unit.timeZone,
    active: unit.active,
  };
}

export const packagesDirectory: PackagesDirectory = {
  async patient(ctx, patientId) {
    const found = await patients.getPatientIdentity(ctx, patientId);
    if (!found.ok) return fail(found.error);
    return ok({ id: found.value.id, displayName: found.value.displayName });
  },

  async service(ctx, serviceId) {
    const found = await services.getServiceSummaries(ctx, [serviceId]);
    const service = found.ok ? found.value[0] : undefined;
    return service ? serviceInfo(service) : null;
  },

  async services(ctx, serviceIds) {
    const found = await services.getServiceSummaries(ctx, serviceIds);
    return found.ok ? found.value.map(serviceInfo) : [];
  },

  async activeServices(ctx) {
    const listed = await services.listActiveServices(ctx);
    return listed.ok ? listed.value.map((service) => serviceInfo({ ...service, active: true })) : [];
  },

  async unit(ctx, unitId) {
    const listed = await units.listUnits(ctx, { activeOnly: false });
    const unit = listed.ok ? listed.value.find((item) => item.id === unitId) : undefined;
    return unit ? unitInfo(unit) : null;
  },

  async activeUnits(ctx) {
    const listed = await units.listUnits(ctx, { activeOnly: true });
    return listed.ok ? listed.value.map(unitInfo) : [];
  },

  async selectedUnitId(ctx) {
    const selected = await units.getSelectedUnit(ctx);
    return selected?.id ?? null;
  },

  async appointments(ctx, appointmentIds) {
    const found = await Promise.all(appointmentIds.map((id) => scheduling.getAppointment(ctx, id)));
    const map = new Map<string, LinkedAppointmentInfo>();
    for (const result of found) {
      if (!result.ok) continue;
      const item = result.value;
      map.set(item.id, {
        id: item.id,
        startsAt: item.startsAt,
        professionalName: item.professional.displayName,
        status: item.status,
        unitTimeZone: item.unitTimeZone,
      });
    }
    return map;
  },

  userNames: (ctx, userIds) => getUserNames(ctx, userIds),

  async approvers(ctx) {
    const listed = await identity.listApprovers(ctx);
    return listed.ok ? listed.value : [];
  },
};
