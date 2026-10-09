import { getUserNames } from "@/modules/identity";
import { patients } from "@/modules/patients";
import { units } from "@/modules/units";
import type { CashDirectory, UnitInfo } from "../application/ports";

// Reads the modules F11 consumes through their public APIs only (PRD F11 Consumes, architecture
// rule 5). A failed read (permission, not found) becomes "absent" and the use cases decide.
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

export const cashDirectory: CashDirectory = {
  async units(ctx, options) {
    const listed = await units.listUnits(ctx, { activeOnly: options.activeOnly });
    return listed.ok ? listed.value.map(unitInfo) : [];
  },

  async unit(ctx, unitId) {
    const listed = await units.listUnits(ctx, { activeOnly: false });
    const unit = listed.ok ? listed.value.find((item) => item.id === unitId) : undefined;
    return unit ? unitInfo(unit) : null;
  },

  async patientNames(ctx, patientIds) {
    const found = await patients.getPatientSummaries(ctx, patientIds);
    return new Map(found.ok ? found.value.map((patient) => [patient.id, patient.displayName]) : []);
  },

  userNames: (ctx, userIds) => getUserNames(ctx, userIds),
};
