import {
  professionals,
  type AffectedAppointment,
  type ProfessionalAppointments,
} from "@/modules/professionals";
import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { createOrganization, createUser, signedInContext } from "../helpers";
import { BASE_UNIT, fullWeek } from "../units/support";

export type TestContext = Awaited<ReturnType<typeof professionalsContext>>;
export type Role = "ADMINISTRATOR" | "MANAGER" | "FRONT_DESK" | "PROFESSIONAL";

export const VALID_CPF = "52998224725";
export const OTHER_CPF = "11144477735";

export const h = (hours: number, minutes = 0) => hours * 60 + minutes;

export async function professionalsContext(role: Role = "ADMINISTRATOR", organizationId?: string) {
  const orgId = organizationId ?? (await createOrganization());
  const user = await createUser({ organizationId: orgId, role, name: "Ana Souza" });
  return (await signedInContext(user)).ctx;
}

// Signs the user in again, so the request context picks up a new link to a professional.
export async function contextFor(user: { email: string; password: string }) {
  return (await signedInContext(user)).ctx;
}

// A unit open Monday to Saturday from 08:00 to 18:00 unless other hours are given.
export async function createUnitWithHours(
  ctx: TestContext,
  options: {
    name?: string;
    timeZone?: string;
    hours?: { weekday: number; intervals: { start: number; end: number }[] }[];
  } = {},
): Promise<string> {
  const created = await units.createUnit(ctx, {
    ...BASE_UNIT,
    name: options.name ?? BASE_UNIT.name,
    timeZone: options.timeZone ?? BASE_UNIT.timeZone,
  });
  if (!created.ok) throw new Error(`createUnit failed: ${created.error.code}`);
  const hours =
    options.hours ??
    [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, intervals: [{ start: h(8), end: h(18) }] }));
  const saved = await units.replaceBusinessHours(ctx, {
    unitId: created.value.unitId,
    days: fullWeek(hours),
  });
  if (!saved.ok) throw new Error(`replaceBusinessHours failed: ${saved.error.code}`);
  return created.value.unitId;
}

export async function createServiceOrThrow(
  ctx: TestContext,
  name = "Consulta dermatológica",
): Promise<string> {
  const categories = await services.listCategories(ctx);
  let categoryId = categories.ok ? categories.value[0]?.id : undefined;
  if (!categoryId) {
    const created = await services.createCategory(ctx, { name: "Consultas" });
    if (!created.ok) throw new Error(`createCategory failed: ${created.error.code}`);
    categoryId = created.value.categoryId;
  }
  const result = await services.createService(ctx, {
    name,
    categoryId,
    description: null,
    durationMinutes: 30,
    prices: [{ currency: "BRL", amountMinor: 25000 }],
    color: "blue",
    requiresRoom: false,
    allowedRoomIds: [],
  });
  if (!result.ok) throw new Error(`createService failed: ${result.error.code}`);
  return result.value.serviceId;
}

// One council registration of a country; the defaults are a Brazilian CRM.
export function registration(overrides: Record<string, unknown> = {}) {
  return {
    country: "BR",
    councilType: "CRM",
    councilOtherName: null,
    number: "123456",
    region: "SP",
    npi: null,
    ...overrides,
  };
}

export function cpfDocument(number: string) {
  return { country: "BR", type: "CPF", number };
}

export function professionalInput(overrides: Record<string, unknown> = {}) {
  return {
    fullName: "Ana Paula Lima",
    displayName: "Dra. Ana Lima",
    specialty: "Dermatologia",
    hasNoCouncil: false,
    registrations: [registration()],
    document: null,
    phone: "(11) 98888-7777",
    email: "ana.lima@clinicaexemplo.com.br",
    color: "teal",
    linkedUserId: null,
    ...overrides,
  };
}

export async function createProfessionalOrThrow(ctx: TestContext, overrides: Record<string, unknown> = {}) {
  const result = await professionals.createProfessional(ctx, professionalInput(overrides));
  if (!result.ok) throw new Error(`createProfessional failed: ${result.error.code}`);
  return result.value.professionalId;
}

// Calendar date in the organization's default time zone, offset by a number of days.
export function orgDate(days = 0): string {
  return dateInTimeZone(new Date(Date.now() + days * 86_400_000), "America/Sao_Paulo");
}

// Fake scheduling (F06) answering fixed values.
export function fakeAppointments(
  values: { future?: number; forServices?: number; inPeriod?: AffectedAppointment[] } = {},
): ProfessionalAppointments {
  return {
    countFuture: async () => values.future ?? 0,
    countFutureForServices: async () => values.forServices ?? 0,
    listInPeriod: async () => values.inPeriod ?? [],
  };
}
