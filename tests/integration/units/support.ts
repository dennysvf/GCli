import { units, type ScheduledAppointments } from "@/modules/units";
import { createOrganization, createUser, signedInContext } from "../helpers";

export const BASE_UNIT = {
  name: "Unidade Centro",
  country: "BR",
  timeZone: "America/Sao_Paulo",
  phone: "(11) 3333-4444",
  email: "centro@clinicaexemplo.com.br",
  address: {
    postalCode: "01310-100",
    street: "Avenida Paulista",
    number: "1000",
    complement: "Sala 12",
    district: "Bela Vista",
    city: "São Paulo",
    region: "SP",
  },
};

export async function managerContext(role: "ADMINISTRATOR" | "MANAGER" | "FRONT_DESK" = "ADMINISTRATOR") {
  const organizationId = await createOrganization();
  const user = await createUser({ organizationId, role });
  return (await signedInContext(user)).ctx;
}

export async function createUnitOrThrow(
  ctx: Awaited<ReturnType<typeof managerContext>>,
  overrides: Record<string, unknown> = {},
) {
  const result = await units.createUnit(ctx, { ...BASE_UNIT, ...overrides });
  if (!result.ok) throw new Error(`createUnit failed: ${result.error.code}`);
  return result.value.unitId;
}

// Fake scheduling (F06) that answers fixed counts.
export function fakeAppointments(
  counts: Partial<Record<Exclude<keyof ScheduledAppointments, "hasAnyInUnit">, number>> & {
    hasAnyInUnit?: boolean;
  },
): ScheduledAppointments {
  return {
    countFutureInRoom: async () => counts.countFutureInRoom ?? 0,
    countFutureInUnit: async () => counts.countFutureInUnit ?? 0,
    countInDateRange: async () => counts.countInDateRange ?? 0,
    countFutureOutsideHours: async () => counts.countFutureOutsideHours ?? 0,
    hasAnyInUnit: async () => counts.hasAnyInUnit ?? false,
  };
}

export function fullWeek(open: { weekday: number; intervals: { start: number; end: number }[] }[] = []) {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const day = open.find((item) => item.weekday === weekday);
    return day ? { weekday, open: true, intervals: day.intervals } : { weekday, open: false, intervals: [] };
  });
}

export function isoDaysFromToday(days: number, timeZone = "America/Sao_Paulo"): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
