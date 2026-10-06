import { services } from "@/modules/services";
import { units } from "@/modules/units";
import { createOrganization, createUser, signedInContext } from "../helpers";
import { BASE_UNIT } from "../units/support";

export type TestContext = Awaited<ReturnType<typeof servicesContext>>;

export async function servicesContext(
  role: "ADMINISTRATOR" | "MANAGER" | "FRONT_DESK" | "PROFESSIONAL" = "ADMINISTRATOR",
  organizationId?: string,
) {
  const orgId = organizationId ?? (await createOrganization());
  const user = await createUser({ organizationId: orgId, role, name: "Ana Souza" });
  return (await signedInContext(user)).ctx;
}

export async function createCategoryOrThrow(ctx: TestContext, name = "Consultas"): Promise<string> {
  const result = await services.createCategory(ctx, { name });
  if (!result.ok) throw new Error(`createCategory failed: ${result.error.code}`);
  return result.value.categoryId;
}

export function serviceInput(categoryId: string, overrides: Record<string, unknown> = {}) {
  return {
    name: "Consulta dermatológica",
    categoryId,
    description: "Avaliação da pele",
    durationMinutes: 30,
    prices: [{ currency: "BRL", amountMinor: 25000 }],
    color: "blue",
    requiresRoom: false,
    allowedRoomIds: [],
    ...overrides,
  };
}

export async function createServiceOrThrow(
  ctx: TestContext,
  categoryId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const result = await services.createService(ctx, serviceInput(categoryId, overrides));
  if (!result.ok)
    throw new Error(`createService failed: ${result.error.code} ${JSON.stringify(result.error)}`);
  return result.value.serviceId;
}

export async function createUnitWithRooms(ctx: TestContext, unitName: string, roomNames: string[]) {
  const unit = await units.createUnit(ctx, { ...BASE_UNIT, name: unitName });
  if (!unit.ok) throw new Error(`createUnit failed: ${unit.error.code}`);
  const roomIds: string[] = [];
  for (const name of roomNames) {
    const room = await units.createRoom(ctx, { unitId: unit.value.unitId, name });
    if (!room.ok) throw new Error(`createRoom failed: ${room.error.code}`);
    roomIds.push(room.value.roomId);
  }
  return { unitId: unit.value.unitId, roomIds };
}

// One price in reais, in minor units.
export const brl = (amountMinor: number) => [{ currency: "BRL", amountMinor }];
