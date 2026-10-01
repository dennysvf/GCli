// Public API of the professionals module (spec F04 section 5).
import { getOrganizationProfile, getUserNames, identity, listLinkableUsers } from "@/modules/identity";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import type { RequestContext } from "@/shared/context/types";
import { getEnabledServices, replaceEnabledServices } from "./application/enabled-services";
import { professionalLinks, serviceProfessionals } from "./application/links";
import type { ProfessionalAppointments, ProfessionalsDeps, UnitInfo } from "./application/ports";
import {
  createProfessional,
  getProfessional,
  listProfessionals,
  setProfessionalActive,
  suggestProfessionalColor,
  updateProfessional,
} from "./application/professionals";
import {
  getProfessionalCredentials,
  getProfessionals,
  getWorkingCalendar,
  isServiceEnabled,
  listBookableProfessionals,
} from "./application/provided";
import { deleteSchedule, listSchedules, saveSchedule } from "./application/schedules";
import { createTimeOff, deleteTimeOff, listTimeOffs } from "./application/time-offs";
import { noProfessionalAppointments } from "./infrastructure/no-appointments";

let professionalAppointments: ProfessionalAppointments = noProfessionalAppointments;

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

const deps: ProfessionalsDeps = {
  appointments: () => professionalAppointments,
  units: {
    async listUnits(ctx, { activeOnly }) {
      const listed = await units.listUnits(ctx, { activeOnly });
      if (!listed.ok) return [];
      return Promise.all(
        listed.value.map(async (unit): Promise<UnitInfo> => {
          const hours = await units.getBusinessHours(ctx, unit.id);
          return {
            id: unit.id,
            name: unit.name,
            timeZone: unit.timeZone,
            active: unit.active,
            businessHours: hours.ok ? hours.value : [],
          };
        }),
      );
    },
  },
  services: {
    async listActiveServices(ctx) {
      const listed = await services.listActiveServices(ctx);
      return listed.ok ? listed.value : [];
    },
    async namesOf(ctx, serviceIds) {
      const found = await Promise.all(serviceIds.map((id) => services.getService(ctx, id)));
      return new Map(found.flatMap((result) => (result.ok ? [[result.value.id, result.value.name]] : [])));
    },
  },
  users: {
    listLinkableUsers: (ctx) => listLinkableUsers(ctx),
    namesOf: (ctx, userIds) => getUserNames(ctx, userIds),
  },
  async organizationTimeZone(ctx) {
    const profile = await getOrganizationProfile(ctx);
    return profile.ok ? profile.value.timeZone : DEFAULT_TIME_ZONE;
  },
  clock: () => new Date(),
};

export const professionals = {
  // Profiles
  listProfessionals: (ctx: RequestContext, input?: unknown) => listProfessionals(deps, ctx, input),
  getProfessional: (ctx: RequestContext, professionalId: string) =>
    getProfessional(deps, ctx, professionalId),
  suggestProfessionalColor: (ctx: RequestContext) => suggestProfessionalColor(ctx),
  createProfessional: (ctx: RequestContext, input: unknown) => createProfessional(deps, ctx, input),
  updateProfessional: (ctx: RequestContext, input: unknown) => updateProfessional(deps, ctx, input),
  setProfessionalActive: (ctx: RequestContext, input: unknown) => setProfessionalActive(deps, ctx, input),
  // Enabled services
  getEnabledServices: (ctx: RequestContext, professionalId: string) =>
    getEnabledServices(deps, ctx, professionalId),
  replaceEnabledServices: (ctx: RequestContext, input: unknown) => replaceEnabledServices(deps, ctx, input),
  // Working-hour schedules
  listSchedules: (ctx: RequestContext, professionalId: string) => listSchedules(deps, ctx, professionalId),
  saveSchedule: (ctx: RequestContext, input: unknown) => saveSchedule(deps, ctx, input),
  deleteSchedule: (ctx: RequestContext, input: unknown) => deleteSchedule(deps, ctx, input),
  // Time-offs
  listTimeOffs: (ctx: RequestContext, professionalId: string, options?: { includeEnded?: boolean }) =>
    listTimeOffs(deps, ctx, professionalId, options),
  createTimeOff: (ctx: RequestContext, input: unknown) => createTimeOff(deps, ctx, input),
  deleteTimeOff: (ctx: RequestContext, input: unknown) => deleteTimeOff(deps, ctx, input),
  // Provided to F06 (scheduling) and F08 (documents)
  listBookableProfessionals: (ctx: RequestContext, options?: { serviceId?: string; unitId?: string }) =>
    listBookableProfessionals(deps, ctx, options),
  isServiceEnabled: (ctx: RequestContext, professionalId: string, serviceId: string) =>
    isServiceEnabled(ctx, professionalId, serviceId),
  getWorkingCalendar: (ctx: RequestContext, professionalId: string, range: { from: string; to: string }) =>
    getWorkingCalendar(deps, ctx, professionalId, range),
  getProfessionals: (ctx: RequestContext, options?: { ids?: string[]; activeOnly?: boolean }) =>
    getProfessionals(ctx, options),
  getProfessionalCredentials: (ctx: RequestContext, professionalId: string) =>
    getProfessionalCredentials(ctx, professionalId),
  // Extension point for scheduling (F06); null restores the inert default.
  registerProfessionalAppointments: (implementation: ProfessionalAppointments | null) => {
    professionalAppointments = implementation ?? noProfessionalAppointments;
  },
};

// Port implementations registered into identity (F01) and services (F03) by the composition root.
export function registerProfessionalsPorts(): void {
  identity.registerProfessionalLinks(professionalLinks);
  services.registerServiceProfessionals(serviceProfessionals);
}

export { canManageTimeOff, canViewProfessional } from "./application/policies";
export type { AffectedAppointment, ProfessionalAppointments, UnitInfo } from "./application/ports";
export type { ProfessionalDetails, ProfessionalListItem } from "./application/professionals";
export type { EnabledServices, ReplaceEnabledServicesResult } from "./application/enabled-services";
export type { SaveScheduleResult, ScheduleItem, ScheduleList } from "./application/schedules";
export type { CreateTimeOffResult, TimeOffItem, TimeOffList } from "./application/time-offs";
export type {
  BookableProfessional,
  ProfessionalCredentials,
  ProfessionalSummary,
  WorkingCalendar,
} from "./application/provided";
export { PROFESSIONAL_STATUSES, type ProfessionalStatusFilter } from "./application/schemas";
export {
  professionalsMessages,
  PROFESSIONALS_NOT_LINKED,
  PROFESSIONALS_SCHEDULE_PREVIOUS_CLOSED,
  PROFESSIONALS_SERVICES_REMOVED_WITH_APPOINTMENTS,
  PROFESSIONALS_TIME_OFF_AFFECTED_APPOINTMENTS,
} from "./messages";
