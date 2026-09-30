import { authorize } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { MAX_ACTIVE_SERVICES } from "../domain/limits";
import { nextDefaultColor, type ServiceColor } from "../domain/palette";
import { isUniqueViolation } from "./categories";
import { ServicesErrors } from "./errors";
import type { ServicesDeps } from "./ports";
import {
  createServiceSchema,
  listServicesSchema,
  setServiceActiveSchema,
  updateServiceSchema,
  type ServiceStatusFilter,
} from "./schemas";

export type ServiceListItem = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  color: ServiceColor;
  requiresRoom: boolean;
  enabledProfessionals: number;
  active: boolean;
};

export type ServiceGroup = { category: { id: string; name: string }; services: ServiceListItem[] };

export type ServiceList = {
  groups: ServiceGroup[];
  filters: { search?: string; categoryId?: string; status: ServiceStatusFilter };
};

export type ServiceDetails = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  color: ServiceColor;
  requiresRoom: boolean;
  active: boolean;
  version: number;
  allowedRoomIds: string[];
};

export type PriceChangeItem = {
  id: string;
  changedAt: Date;
  previousPriceCents: number | null;
  priceCents: number;
  changedBy: { id: string; name: string } | null;
};

export type SaveServiceResult = { serviceId: string; version: number; priceChanged: boolean };

async function nameTaken(uow: UnitOfWork, name: string, exceptId?: string): Promise<boolean> {
  // Inactive services count too, so reactivation never creates duplicates (spec F03 assumptions).
  const existing = await uow.tx.service.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!existing;
}

// Rooms added to a service must be active rooms of the organization. Rooms already linked stay
// even if they became inactive (they are ignored when booking, spec F03 section 3).
async function roomsAreValid(
  deps: ServicesDeps,
  ctx: RequestContext,
  roomIds: string[],
  alreadyLinked: Set<string> = new Set(),
): Promise<boolean> {
  const added = roomIds.filter((id) => !alreadyLinked.has(id));
  if (added.length === 0) return true;
  const rooms = await deps.rooms.findRooms(ctx, added);
  const active = new Set(rooms.filter((room) => room.active).map((room) => room.id));
  return added.every((id) => active.has(id));
}

async function recordPriceChange(
  uow: UnitOfWork,
  ctx: RequestContext,
  serviceId: string,
  previousPriceCents: number | null,
  priceCents: number,
  at: Date,
): Promise<void> {
  await uow.tx.servicePriceChange.create({
    data: {
      id: newId(),
      organizationId: ctx.organizationId,
      serviceId,
      previousPriceCents,
      priceCents,
      changedAt: at,
      changedById: ctx.user.id,
    },
  });
}

export async function listServices(
  deps: ServicesDeps,
  ctx: RequestContext,
  input: unknown = {},
): Promise<Result<ServiceList>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(listServicesSchema, input ?? {});
  if (!parsed.ok) return parsed;
  const filters = parsed.value;

  const loaded = await withTransaction(ctx, async (uow) => {
    const categories = await uow.tx.serviceCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
    const services = await uow.tx.service.findMany({
      where: {
        ...(filters.search ? { name: { contains: filters.search, mode: "insensitive" } } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.status === "all" ? {} : { active: filters.status === "active" }),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        categoryId: true,
        name: true,
        durationMinutes: true,
        priceCents: true,
        color: true,
        requiresRoom: true,
        active: true,
      },
    });
    return ok({ categories, services });
  });
  if (!loaded.ok) return loaded;
  const { categories, services } = loaded.value;

  const professionals = await deps.professionals().countByService(
    ctx.organizationId,
    services.map((service) => service.id),
  );
  // With no filter an empty category stays visible, so managers see where to add services.
  const filtered = !!filters.search || !!filters.categoryId || filters.status !== "active";
  const groups = categories
    .map((category) => ({
      category,
      services: services
        .filter((service) => service.categoryId === category.id)
        .map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          priceCents: service.priceCents,
          color: service.color as ServiceColor,
          requiresRoom: service.requiresRoom,
          enabledProfessionals: professionals.get(service.id) ?? 0,
          active: service.active,
        })),
    }))
    .filter((group) => !filtered || group.services.length > 0);
  return ok({ groups, filters });
}

export async function getService(ctx: RequestContext, serviceId: string): Promise<Result<ServiceDetails>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const service = await uow.tx.service.findFirst({
      where: { id: serviceId },
      include: {
        category: { select: { name: true } },
        allowedRooms: { select: { roomId: true } },
      },
    });
    if (!service) return fail(ServicesErrors.notFound());
    return ok({
      id: service.id,
      name: service.name,
      categoryId: service.categoryId,
      categoryName: service.category.name,
      description: service.description,
      durationMinutes: service.durationMinutes,
      priceCents: service.priceCents,
      color: service.color as ServiceColor,
      requiresRoom: service.requiresRoom,
      active: service.active,
      version: service.version,
      allowedRoomIds: service.allowedRooms.map((room) => room.roomId).sort(),
    });
  });
}

// Default color for the "Novo serviço" form: the first one no active service uses yet.
export async function suggestServiceColor(ctx: RequestContext): Promise<Result<ServiceColor>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const used = await uow.tx.service.findMany({ where: { active: true }, select: { color: true } });
    return ok(nextDefaultColor(used.map((service) => service.color)));
  });
}

export async function createService(
  deps: ServicesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SaveServiceResult>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createServiceSchema, input);
  if (!parsed.ok) return parsed;
  const { allowedRoomIds, ...fields } = parsed.value;
  // Rooms only matter when the service requires one (spec F03 assumptions).
  const roomIds = fields.requiresRoom ? allowedRoomIds : [];
  if (!(await roomsAreValid(deps, ctx, roomIds))) return fail(ServicesErrors.invalidRooms());

  try {
    return await withTransaction(ctx, async (uow) => {
      const category = await uow.tx.serviceCategory.findFirst({
        where: { id: fields.categoryId },
        select: { id: true },
      });
      if (!category) return fail(ServicesErrors.categoryNotFound(true));
      if ((await uow.tx.service.count({ where: { active: true } })) >= MAX_ACTIVE_SERVICES) {
        return fail(ServicesErrors.serviceLimit());
      }
      if (await nameTaken(uow, fields.name)) return fail(ServicesErrors.nameTaken());

      const id = newId();
      await uow.tx.service.create({
        data: { id, organizationId: ctx.organizationId, ...fields, createdById: ctx.user.id },
      });
      if (roomIds.length > 0) {
        await uow.tx.serviceAllowedRoom.createMany({
          data: roomIds.map((roomId) => ({ serviceId: id, roomId, organizationId: ctx.organizationId })),
        });
      }
      await recordPriceChange(uow, ctx, id, null, fields.priceCents, deps.clock());
      await uow.audit.record({
        action: "CREATE",
        entityType: "service",
        entityId: id,
        summary: "Serviço criado",
        changes: diffChanges(null, { ...fields, allowedRoomIds: [...roomIds].sort() }),
      });
      return ok({ serviceId: id, version: 1, priceChanged: true });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(ServicesErrors.nameTaken());
    throw error;
  }
}

export async function updateService(
  deps: ServicesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SaveServiceResult>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateServiceSchema, input);
  if (!parsed.ok) return parsed;
  const { serviceId, version, allowedRoomIds, ...fields } = parsed.value;
  const roomIds = fields.requiresRoom ? allowedRoomIds : [];

  try {
    return await withTransaction(ctx, async (uow) => {
      const before = await uow.tx.service.findFirst({
        where: { id: serviceId },
        include: { allowedRooms: { select: { roomId: true } } },
      });
      if (!before) return fail(ServicesErrors.notFound());
      const linked = new Set(before.allowedRooms.map((room) => room.roomId));
      if (!(await roomsAreValid(deps, ctx, roomIds, linked))) return fail(ServicesErrors.invalidRooms());
      if (fields.categoryId !== before.categoryId) {
        const category = await uow.tx.serviceCategory.findFirst({
          where: { id: fields.categoryId },
          select: { id: true },
        });
        if (!category) return fail(ServicesErrors.categoryNotFound(true));
      }
      if (await nameTaken(uow, fields.name, serviceId)) return fail(ServicesErrors.nameTaken());

      const updated = await uow.tx.service.updateMany({
        where: { id: serviceId, version },
        data: { ...fields, version: { increment: 1 }, updatedById: ctx.user.id },
      });
      if (updated.count !== 1) return fail(CommonErrors.staleVersion());

      await uow.tx.serviceAllowedRoom.deleteMany({ where: { serviceId } });
      if (roomIds.length > 0) {
        await uow.tx.serviceAllowedRoom.createMany({
          data: roomIds.map((roomId) => ({ serviceId, roomId, organizationId: ctx.organizationId })),
        });
      }
      // PRD F03: every price change is stored with its date and author; appointments keep the
      // price they snapshotted, so nothing else changes here.
      const priceChanged = before.priceCents !== fields.priceCents;
      if (priceChanged) {
        await recordPriceChange(uow, ctx, serviceId, before.priceCents, fields.priceCents, deps.clock());
      }
      await uow.audit.record({
        action: "UPDATE",
        entityType: "service",
        entityId: serviceId,
        summary: priceChanged ? "Serviço alterado (novo preço)" : "Serviço alterado",
        changes: diffChanges(
          { ...before, allowedRoomIds: [...linked].sort() },
          { ...fields, allowedRoomIds: [...roomIds].sort() },
        ),
      });
      return ok({ serviceId, version: version + 1, priceChanged });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(ServicesErrors.nameTaken());
    throw error;
  }
}

export async function setServiceActive(
  deps: ServicesDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ active: boolean; futureAppointments: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setServiceActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { serviceId, active } = parsed.value;

  const changed = await withTransaction(ctx, async (uow) => {
    const service = await uow.tx.service.findFirst({ where: { id: serviceId }, select: { active: true } });
    if (!service) return fail(ServicesErrors.notFound());
    if (service.active === active) return ok(false);
    if (active && (await uow.tx.service.count({ where: { active: true } })) >= MAX_ACTIVE_SERVICES) {
      return fail(ServicesErrors.serviceLimit());
    }
    await uow.tx.service.update({
      where: { id: serviceId },
      data: { active, version: { increment: 1 }, updatedById: ctx.user.id },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "service",
      entityId: serviceId,
      summary: active ? "Serviço reativado" : "Serviço desativado",
      changes: { active: { before: !active, after: active } },
    });
    return ok(true);
  });
  if (!changed.ok) return changed;

  // PRD F03: future appointments are kept; the count only feeds the warning.
  const futureAppointments =
    !active && changed.value
      ? await deps.appointments().countFuture(ctx.organizationId, serviceId, deps.clock())
      : 0;
  return ok({ active, futureAppointments });
}

export async function listPriceHistory(
  deps: ServicesDeps,
  ctx: RequestContext,
  serviceId: string,
): Promise<Result<PriceChangeItem[]>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  const loaded = await withTransaction(ctx, async (uow) => {
    const service = await uow.tx.service.findFirst({ where: { id: serviceId }, select: { id: true } });
    if (!service) return fail(ServicesErrors.notFound());
    return ok(
      await uow.tx.servicePriceChange.findMany({
        where: { serviceId },
        // UUIDv7 ids are time-ordered, so they break ties between changes in the same instant.
        orderBy: [{ changedAt: "desc" }, { id: "desc" }],
        select: { id: true, changedAt: true, previousPriceCents: true, priceCents: true, changedById: true },
      }),
    );
  });
  if (!loaded.ok) return loaded;

  const authorIds = loaded.value.flatMap((change) => (change.changedById ? [change.changedById] : []));
  const names = await deps.users.namesOf(ctx, authorIds);
  return ok(
    loaded.value.map(({ changedById, ...change }) => ({
      ...change,
      changedBy: changedById ? { id: changedById, name: names.get(changedById) ?? "Usuário removido" } : null,
    })),
  );
}
