import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { ServiceColor } from "../domain/palette";
import { resolveAllowedRooms } from "../domain/service-rules";
import { ServicesErrors } from "./errors";
import type { ServicesDeps } from "./ports";

// Read API provided to F04 (enablement), F06 (booking), F09 (charges) and F10 (packages).

export type ActiveService = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  durationMinutes: number;
  priceCents: number;
  color: ServiceColor;
  requiresRoom: boolean;
};

export type AllowedRooms =
  { requiresRoom: false } | { requiresRoom: true; rooms: "any" | { id: string; name: string }[] };

// PRD F03 cross-feature: only active services are offered by other features.
export async function listActiveServices(ctx: RequestContext): Promise<Result<ActiveService[]>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.service.findMany({
      where: { active: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { category: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        categoryId: true,
        durationMinutes: true,
        priceCents: true,
        color: true,
        requiresRoom: true,
        category: { select: { name: true } },
      },
    });
    return ok(
      rows.map(({ category, ...service }) => ({
        ...service,
        color: service.color as ServiceColor,
        categoryName: category.name,
      })),
    );
  });
}

// Rooms where the service can be booked in a unit (per-unit restriction, spec F03 section 3).
// An empty list means the unit has no bookable room left for this service.
export async function getAllowedRooms(
  deps: ServicesDeps,
  ctx: RequestContext,
  serviceId: string,
  unitId: string,
): Promise<Result<AllowedRooms>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  const loaded = await withTransaction(ctx, async (uow) => {
    const service = await uow.tx.service.findFirst({
      where: { id: serviceId },
      select: { requiresRoom: true, allowedRooms: { select: { roomId: true } } },
    });
    return service ? ok(service) : fail(ServicesErrors.notFound());
  });
  if (!loaded.ok) return loaded;
  if (!loaded.value.requiresRoom) return ok({ requiresRoom: false });

  const roomIds = loaded.value.allowedRooms.map((room) => room.roomId);
  const rooms = roomIds.length > 0 ? await deps.rooms.findRooms(ctx, roomIds) : [];
  return ok({ requiresRoom: true, rooms: resolveAllowedRooms(rooms, unitId) });
}
