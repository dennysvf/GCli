// Public API of the services module (spec F03 section 5).
import { getUserNames } from "@/modules/identity";
import { units } from "@/modules/units";
import { isCurrency, type Currency } from "@/shared/kernel/countries/codes";
import type { RequestContext } from "@/shared/context/types";
import { definePort } from "@/shared/ports/registry";
import {
  createCategory,
  deleteCategory,
  listCategories,
  moveCategory,
  renameCategory,
} from "./application/categories";
import type { ScheduledServiceAppointments, ServiceProfessionals, ServicesDeps } from "./application/ports";
import { getAllowedRooms, getServiceSummaries, listActiveServices } from "./application/provided";
import { servicesWithoutPrice } from "./application/pricing";
import {
  createService,
  getService,
  listPriceHistory,
  listServices,
  setServiceActive,
  suggestServiceColor,
  updateService,
} from "./application/services";
import { noServiceAppointments, noServiceProfessionals } from "./infrastructure/no-usage";

const scheduledAppointments = definePort<ScheduledServiceAppointments>(
  "services.ScheduledServiceAppointments",
  noServiceAppointments,
);
const serviceProfessionals = definePort<ServiceProfessionals>(
  "services.ServiceProfessionals",
  noServiceProfessionals,
);

const deps: ServicesDeps = {
  currencies: {
    // Distinct currencies of the active units: the prices every service needs (PRD F16).
    currenciesInUse: async (ctx) => {
      const list = await units.listUnits(ctx, { activeOnly: true });
      if (!list.ok) return [];
      return [...new Set(list.value.map((unit) => unit.currency))].filter((currency): currency is Currency =>
        isCurrency(currency),
      );
    },
  },
  rooms: {
    findRooms: async (ctx, roomIds) => {
      const rooms = await units.getRooms(ctx, { roomIds });
      return rooms.ok ? rooms.value : [];
    },
  },
  users: { namesOf: (ctx, userIds) => getUserNames(ctx, userIds) },
  appointments: () => scheduledAppointments.get(),
  professionals: () => serviceProfessionals.get(),
  clock: () => new Date(),
};

export const services = {
  // Services
  listServices: (ctx: RequestContext, input?: unknown) => listServices(deps, ctx, input),
  getService: (ctx: RequestContext, serviceId: string) => getService(ctx, serviceId),
  suggestServiceColor: (ctx: RequestContext) => suggestServiceColor(ctx),
  createService: (ctx: RequestContext, input: unknown) => createService(deps, ctx, input),
  updateService: (ctx: RequestContext, input: unknown) => updateService(deps, ctx, input),
  setServiceActive: (ctx: RequestContext, input: unknown) => setServiceActive(deps, ctx, input),
  listPriceHistory: (ctx: RequestContext, serviceId: string) => listPriceHistory(deps, ctx, serviceId),
  // Categories
  listCategories: (ctx: RequestContext) => listCategories(ctx),
  createCategory: (ctx: RequestContext, input: unknown) => createCategory(ctx, input),
  renameCategory: (ctx: RequestContext, input: unknown) => renameCategory(ctx, input),
  moveCategory: (ctx: RequestContext, input: unknown) => moveCategory(ctx, input),
  deleteCategory: (ctx: RequestContext, input: unknown) => deleteCategory(ctx, input),
  // Provided to F04, F06, F09 and F10
  listActiveServices: (ctx: RequestContext) => listActiveServices(ctx),
  getServiceSummaries: (ctx: RequestContext, serviceIds: string[]) => getServiceSummaries(ctx, serviceIds),
  getAllowedRooms: (ctx: RequestContext, serviceId: string, unitId: string) =>
    getAllowedRooms(deps, ctx, serviceId, unitId),
  // Extension points for scheduling (F06) and professionals (F04); null restores the default.
  registerScheduledServiceAppointments: (implementation: ScheduledServiceAppointments | null) => {
    scheduledAppointments.register(implementation);
  },
  registerServiceProfessionals: (implementation: ServiceProfessionals | null) => {
    serviceProfessionals.register(implementation);
  },
};

export { subscribeServicesEvents } from "./events";

// Registers what services provides to units (active services without a price in a currency).
export function registerServicesPorts(): void {
  units.registerServicePricing({ servicesWithoutPrice });
}
export type { ScheduledServiceAppointments, ServiceProfessionals } from "./application/ports";
export type { CategoryItem } from "./application/categories";
export type { ActiveService, AllowedRooms, ServiceSummary } from "./application/provided";
export { priceIn } from "./domain/service-rules";
export type { ServicePriceItem } from "./application/services";
export type {
  PriceChangeItem,
  SaveServiceResult,
  ServiceDetails,
  ServiceGroup,
  ServiceList,
  ServiceListItem,
} from "./application/services";
export { SERVICE_STATUSES, type ServiceStatusFilter } from "./application/schemas";
export { SERVICE_COLORS, type ServiceColor } from "./domain/palette";
export { formatDuration } from "./domain/service-rules";
export { servicesCatalog } from "./messages/catalog";
export { SERVICES_DEACTIVATED_WITH_APPOINTMENTS, SERVICES_PRICE_CHANGE_CONFIRMATION } from "./notices";
export { CategoriesDialog } from "./ui/categories-dialog";
export { ServicesFilters } from "./ui/services-filters";
export { ServiceSheet } from "./ui/service-sheet";
export { ServicesTable } from "./ui/services-table";
