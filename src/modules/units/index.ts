// Public API of the units module (spec F02 section 5).
import type { RequestContext } from "@/shared/context/types";
import { definePort } from "@/shared/ports/registry";
import { getBusinessHours, replaceBusinessHours } from "./application/business-hours";
import { createClosure, deleteClosure, listClosures } from "./application/closures";
import type {
  ScheduledAppointments,
  ServicePricing,
  UnitFinancialRecords,
  UnitsDeps,
} from "./application/ports";
import { getUnitContact, getUnitSchedule } from "./application/provided";
import { createRoom, getRooms, listRooms, setRoomActive, updateRoom } from "./application/rooms";
import { getSelectedUnit, selectUnit } from "./application/selection";
import { createUnit, getUnit, listUnits, setUnitActive, updateUnit } from "./application/units";
import { noAppointments } from "./infrastructure/no-appointments";
import { noFinancialRecords } from "./infrastructure/no-financial-records";
import { noPricing } from "./infrastructure/no-pricing";

const scheduledAppointments = definePort<ScheduledAppointments>(
  "units.ScheduledAppointments",
  noAppointments,
);

const servicePricing = definePort<ServicePricing>("units.ServicePricing", noPricing);

// F09 registers the real check (charges and payments in the unit) through the composition root.
const unitFinancialRecords = definePort<UnitFinancialRecords>(
  "units.UnitFinancialRecords",
  noFinancialRecords,
);

const deps: UnitsDeps = {
  appointments: () => scheduledAppointments.get(),
  financialRecords: () => unitFinancialRecords.get(),
  pricing: () => servicePricing.get(),
  clock: () => new Date(),
};

export const units = {
  // Units
  listUnits: (ctx: RequestContext, options?: { activeOnly?: boolean }) => listUnits(ctx, options),
  getUnit: (ctx: RequestContext, unitId: string) => getUnit(ctx, unitId),
  createUnit: (ctx: RequestContext, input: unknown) => createUnit(deps, ctx, input),
  updateUnit: (ctx: RequestContext, input: unknown) => updateUnit(deps, ctx, input),
  setUnitActive: (ctx: RequestContext, input: unknown) => setUnitActive(deps, ctx, input),
  // Business hours
  getBusinessHours: (ctx: RequestContext, unitId: string) => getBusinessHours(ctx, unitId),
  replaceBusinessHours: (ctx: RequestContext, input: unknown) => replaceBusinessHours(deps, ctx, input),
  // Rooms
  listRooms: (ctx: RequestContext, unitId: string, options?: { activeOnly?: boolean }) =>
    listRooms(ctx, unitId, options),
  getRooms: (ctx: RequestContext, options?: { roomIds?: string[]; activeOnly?: boolean }) =>
    getRooms(ctx, options),
  createRoom: (ctx: RequestContext, input: unknown) => createRoom(ctx, input),
  updateRoom: (ctx: RequestContext, input: unknown) => updateRoom(ctx, input),
  setRoomActive: (ctx: RequestContext, input: unknown) => setRoomActive(deps, ctx, input),
  // Closures
  listClosures: (ctx: RequestContext, unitId: string) => listClosures(ctx, unitId, deps.clock()),
  createClosure: (ctx: RequestContext, input: unknown) => createClosure(deps, ctx, input),
  deleteClosure: (ctx: RequestContext, input: unknown) => deleteClosure(deps, ctx, input),
  // Header selection
  getSelectedUnit: (ctx: RequestContext) => getSelectedUnit(ctx),
  selectUnit: (ctx: RequestContext, input: unknown) => selectUnit(ctx, input),
  // Provided to F04, F06 (schedule) and F08 (contact)
  getUnitSchedule: (ctx: RequestContext, unitId: string) => getUnitSchedule(ctx, unitId, deps.clock()),
  getUnitContact: (ctx: RequestContext, unitId: string) => getUnitContact(ctx, unitId),
  // Extension point for scheduling (F06); pass null to restore the zero default.
  registerScheduledAppointments: (implementation: ScheduledAppointments | null) => {
    scheduledAppointments.register(implementation);
  },
  // Extension point for billing (F09); pass null to restore the default (no financial records).
  registerUnitFinancialRecords: (implementation: UnitFinancialRecords | null) => {
    unitFinancialRecords.register(implementation);
  },
  // Extension point for services (F03): active services without a price in a currency.
  registerServicePricing: (implementation: ServicePricing | null) => {
    servicePricing.register(implementation);
  },
};

export type { ScheduledAppointments, ServicePricing, UnitFinancialRecords } from "./application/ports";
export type { UnitDetails, UnitSummary } from "./application/units";
export type { RoomItem, RoomWithUnit } from "./application/rooms";
export type { ClosureItem } from "./application/closures";
export type { SelectedUnit } from "./application/selection";
export type { UnitContact, UnitSchedule } from "./application/provided";
export { formatUnitAddress } from "./application/provided";
export {
  closedWeek,
  isWithinHours,
  WEEKDAY_LABELS,
  type DaySchedule,
  type Interval,
  type Week,
} from "./domain/business-hours";
export { unitsCatalog } from "./messages/catalog";
export { BusinessHoursForm } from "./ui/business-hours-form";
export { ClosuresPanel } from "./ui/closures-panel";
export { RoomsPanel } from "./ui/rooms-panel";
export { UnitForm } from "./ui/unit-form";
export { UnitSelector } from "./ui/unit-selector";
