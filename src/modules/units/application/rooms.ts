import { authorize } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { MAX_ACTIVE_ROOMS_PER_UNIT } from "../domain/limits";
import { UnitsErrors } from "./errors";
import type { UnitsDeps } from "./ports";
import { createRoomSchema, setRoomActiveSchema, updateRoomSchema } from "./schemas";

export type RoomItem = {
  id: string;
  unitId: string;
  name: string;
  description: string | null;
  active: boolean;
};

const roomSelect = { id: true, unitId: true, name: true, description: true, active: true } as const;

async function roomNameTaken(uow: UnitOfWork, unitId: string, name: string, exceptId?: string) {
  const existing = await uow.tx.room.findFirst({
    where: {
      unitId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return !!existing;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "P2002";
}

export async function listRooms(
  ctx: RequestContext,
  unitId: string,
  options: { activeOnly?: boolean } = {},
): Promise<Result<RoomItem[]>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) =>
    ok(
      await uow.tx.room.findMany({
        where: { unitId, ...(options.activeOnly ? { active: true } : {}) },
        orderBy: { name: "asc" },
        select: roomSelect,
      }),
    ),
  );
}

export async function createRoom(ctx: RequestContext, input: unknown): Promise<Result<{ roomId: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createRoomSchema, input);
  if (!parsed.ok) return parsed;
  const { unitId, name, description } = parsed.value;

  try {
    return await withTransaction(ctx, async (uow) => {
      const unit = await uow.tx.unit.findFirst({ where: { id: unitId }, select: { active: true } });
      if (!unit) return fail(UnitsErrors.notFound());
      if (!unit.active) return fail(UnitsErrors.unitInactive());
      if ((await uow.tx.room.count({ where: { unitId, active: true } })) >= MAX_ACTIVE_ROOMS_PER_UNIT) {
        return fail(UnitsErrors.roomLimit());
      }
      if (await roomNameTaken(uow, unitId, name)) return fail(UnitsErrors.roomNameTaken());
      const id = newId();
      await uow.tx.room.create({
        data: { id, organizationId: ctx.organizationId, unitId, name, description },
      });
      await uow.audit.record({
        action: "CREATE",
        entityType: "room",
        entityId: id,
        summary: "Sala criada",
        changes: diffChanges(null, { unitId, name, description }),
      });
      return ok({ roomId: id });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(UnitsErrors.roomNameTaken());
    throw error;
  }
}

export async function updateRoom(ctx: RequestContext, input: unknown): Promise<Result<{ roomId: string }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateRoomSchema, input);
  if (!parsed.ok) return parsed;
  const { roomId, name, description } = parsed.value;

  try {
    return await withTransaction(ctx, async (uow) => {
      const before = await uow.tx.room.findFirst({ where: { id: roomId } });
      if (!before) return fail(UnitsErrors.notFound());
      if (await roomNameTaken(uow, before.unitId, name, roomId)) return fail(UnitsErrors.roomNameTaken());
      await uow.tx.room.update({
        where: { id: roomId },
        data: { name, description, version: { increment: 1 } },
      });
      await uow.audit.record({
        action: "UPDATE",
        entityType: "room",
        entityId: roomId,
        summary: "Sala alterada",
        changes: diffChanges(before, { name, description }),
      });
      return ok({ roomId });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(UnitsErrors.roomNameTaken());
    throw error;
  }
}

export async function setRoomActive(
  deps: UnitsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ active: boolean }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setRoomActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { roomId, active } = parsed.value;

  if (!active) {
    // PRD F02: a room with future appointments cannot be deactivated.
    const future = await deps.appointments().countFutureInRoom(ctx.organizationId, roomId, deps.clock());
    if (future > 0) return fail(UnitsErrors.roomHasAppointments(future));
  }

  return withTransaction(ctx, async (uow) => {
    const room = await uow.tx.room.findFirst({ where: { id: roomId } });
    if (!room) return fail(UnitsErrors.notFound());
    if (room.active === active) return ok({ active });
    if (
      active &&
      (await uow.tx.room.count({ where: { unitId: room.unitId, active: true } })) >= MAX_ACTIVE_ROOMS_PER_UNIT
    ) {
      return fail(UnitsErrors.roomLimit());
    }
    await uow.tx.room.update({ where: { id: roomId }, data: { active, version: { increment: 1 } } });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "room",
      entityId: roomId,
      summary: active ? "Sala reativada" : "Sala desativada",
      changes: { active: { before: !active, after: active } },
    });
    return ok({ active });
  });
}
