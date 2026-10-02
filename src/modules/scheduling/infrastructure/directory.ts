import { getOrganizationProfile, getUserNames, identity } from "@/modules/identity";
import { patients } from "@/modules/patients";
import { professionals } from "@/modules/professionals";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import type { RequestContext } from "@/shared/context/types";
import type { LocalInterval, SchedulingDirectory } from "../application/ports";

// Reads the modules F06 consumes through their public APIs only (PRD F06 Consumes,
// architecture rule 5). Failures (permission, not found) become "absent", and the use cases
// decide what that means.

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_GRANULARITY = 15;

export const schedulingDirectory: SchedulingDirectory = {
  async organization(ctx) {
    const [profile, logo] = await Promise.all([
      getOrganizationProfile(ctx),
      identity.getOrganizationLogo(ctx),
    ]);
    const value = profile.ok ? profile.value : null;
    return {
      name: value?.tradeName ?? value?.legalName ?? "",
      timeZone: value?.timeZone ?? DEFAULT_TIME_ZONE,
      granularity: value?.slotGranularityMinutes ?? DEFAULT_GRANULARITY,
      // The logo is stored as PNG (F01 logo processor).
      logo: logo.ok && logo.value ? { data: Buffer.from(logo.value.body), format: "png" } : null,
    };
  },

  async unit(ctx, unitId) {
    const schedule = await units.getUnitSchedule(ctx, unitId);
    if (!schedule.ok) return null;
    const businessHours = new Map<number, LocalInterval[]>(
      schedule.value.businessHours.map((day) => [day.weekday, day.open ? day.intervals : []]),
    );
    return {
      id: schedule.value.unitId,
      name: schedule.value.name,
      timeZone: schedule.value.timeZone,
      active: schedule.value.active,
      businessHours,
      closures: schedule.value.closures,
      rooms: schedule.value.rooms,
    };
  },

  async listUnits(ctx) {
    const listed = await units.listUnits(ctx, { activeOnly: false });
    return listed.ok
      ? listed.value.map((unit) => ({
          id: unit.id,
          name: unit.name,
          timeZone: unit.timeZone,
          active: unit.active,
        }))
      : [];
  },

  async services(ctx, serviceIds) {
    const found = await services.getServiceSummaries(ctx, serviceIds);
    return found.ok ? found.value : [];
  },

  async allowedRooms(ctx, serviceId, unitId) {
    const rooms = await services.getAllowedRooms(ctx, serviceId, unitId);
    return rooms.ok ? rooms.value : null;
  },

  async rooms(ctx, roomIds) {
    if (roomIds.length === 0) return [];
    const found = await units.getRooms(ctx, { roomIds: [...new Set(roomIds)] });
    return found.ok ? found.value.map(({ id, name, active, unitId }) => ({ id, name, active, unitId })) : [];
  },

  async isServiceEnabled(ctx, professionalId, serviceId) {
    const enabled = await professionals.isServiceEnabled(ctx, professionalId, serviceId);
    return enabled.ok && enabled.value;
  },

  async bookableProfessionals(ctx, options) {
    const listed = await professionals.listBookableProfessionals(ctx, options);
    return listed.ok ? listed.value.map((item) => ({ ...item, active: true })) : [];
  },

  async professionals(ctx, ids) {
    const listed = await professionals.getProfessionals(ctx, ids ? { ids: [...new Set(ids)] } : {});
    return listed.ok
      ? listed.value.map(({ id, displayName, color, active }) => ({ id, displayName, color, active }))
      : [];
  },

  async workingCalendar(ctx: RequestContext, professionalId, range) {
    const calendar = await professionals.getWorkingCalendar(ctx, professionalId, range);
    if (!calendar.ok) return null;
    return {
      days: calendar.value.days.map((day) => ({
        date: day.date,
        units: day.units.map((unit) => ({ unitId: unit.unitId, intervals: unit.intervals })),
      })),
      timeOffs: calendar.value.timeOffs.map((item) => ({
        startsAt: new Date(item.startsAt),
        endsAt: new Date(item.endsAt),
        type: item.type,
      })),
    };
  },

  async patients(ctx, patientIds) {
    const found = await patients.getPatientSummaries(ctx, patientIds);
    return found.ok ? found.value : [];
  },

  userNames: (ctx, userIds) => getUserNames(ctx, userIds),
};
