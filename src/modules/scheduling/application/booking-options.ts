import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { ok, type Result } from "@/shared/kernel/result";
import { z } from "zod";
import { parseInput } from "@/shared/kernel/validation";
import { candidateRooms } from "./booking";
import type { SchedulingDeps } from "./ports";

export type BookingOptions = {
  professionals: { id: string; displayName: string; color: string }[];
  requiresRoom: boolean;
  rooms: { id: string; name: string }[];
};

const optionsSchema = z.object({ unitId: z.uuid(), serviceId: z.uuid() });

// Choices of the booking panel once a service is picked (PRD F06 Experience: professional
// filtered by service, room filtered and auto-selected when only one is available).
export async function getBookingOptions(
  deps: SchedulingDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<BookingOptions>> {
  const allowed = await authorize(ctx, "schedule:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(optionsSchema, input);
  if (!parsed.ok) return parsed;
  const { unitId, serviceId } = parsed.value;
  const [unit, professionals] = await Promise.all([
    deps.directory.unit(ctx, unitId),
    deps.directory.bookableProfessionals(ctx, { serviceId, unitId }),
  ]);
  if (!unit) return ok({ professionals: [], requiresRoom: false, rooms: [] });
  const required = await candidateRooms(deps, ctx, unit, serviceId);
  return ok({
    professionals: professionals.map(({ id, displayName, color }) => ({ id, displayName, color })),
    requiresRoom: required !== null,
    rooms: required ?? unit.rooms.filter((room) => room.active).map(({ id, name }) => ({ id, name })),
  });
}
