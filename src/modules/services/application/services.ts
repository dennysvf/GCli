import { authorize } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { isCurrency, type Currency } from "@/shared/kernel/countries/codes";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { MAX_ACTIVE_SERVICES } from "../domain/limits";
import { nextDefaultColor, type ServiceColor } from "../domain/palette";
import { priceIn } from "../domain/service-rules";
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

// One price of a service in a currency, in minor units (PRD F16).
export type ServicePriceItem = { currency: Currency; amountMinor: number };

// Prices as stored (bigint minor units) to the shape the rest of the system uses, ordered by currency.
export function toPrices(rows: { currency: string; amountMinor: bigint }[]): ServicePriceItem[] {
  return rows
    .flatMap((row) =>
      isCurrency(row.currency) ? [{ currency: row.currency, amountMinor: Number(row.amountMinor) }] : [],
    )
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export type ServiceListItem = {
  id: string;
  name: string;
  durationMinutes: number;
  prices: ServicePriceItem[];
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
  prices: ServicePriceItem[];
  color: ServiceColor;
  requiresRoom: boolean;
  active: boolean;
  version: number;
  allowedRoomIds: string[];
};

export type PriceChangeItem = {
  id: string;
  changedAt: Date;
  currency: Currency;
  previousAmountMinor: number | null;
  amountMinor: number;
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
  currency: Currency,
  previousAmountMinor: number | null,
  amountMinor: number,
  at: Date,
): Promise<void> {
  await uow.tx.servicePriceChange.create({
    data: {
      id: newId(),
      organizationId: ctx.organizationId,
      serviceId,
      currency,
      previousAmountMinor: previousAmountMinor === null ? null : BigInt(previousAmountMinor),
      amountMinor: BigInt(amountMinor),
      changedAt: at,
      changedById: ctx.user.id,
    },
  });
}

// Every currency in use by the active units needs a price (PRD F16).
async function missingCurrencies(
  deps: ServicesDeps,
  ctx: RequestContext,
  prices: ServicePriceItem[],
): Promise<Currency[]> {
  const given = new Set(prices.map((price) => price.currency));
  return (await deps.currencies.currenciesInUse(ctx)).filter((currency) => !given.has(currency));
}

// Prices as "BRL 250.00"-style text for the audit log, which keeps one line per currency.
function pricesForAudit(prices: ServicePriceItem[]): string {
  return prices.map((price) => `${price.currency} ${price.amountMinor}`).join(", ");
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
        color: true,
        requiresRoom: true,
        active: true,
        prices: { select: { currency: true, amountMinor: true } },
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
          prices: toPrices(service.prices),
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
        prices: { select: { currency: true, amountMinor: true } },
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
      prices: toPrices(service.prices),
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
  const { allowedRoomIds, prices, ...fields } = parsed.value;
  // Rooms only matter when the service requires one (spec F03 assumptions).
  const roomIds = fields.requiresRoom ? allowedRoomIds : [];
  if (!(await roomsAreValid(deps, ctx, roomIds))) return fail(ServicesErrors.invalidRooms());
  const missing = await missingCurrencies(deps, ctx, prices);
  if (missing.length > 0) return fail(ServicesErrors.priceRequired(missing));

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
      if (prices.length > 0) {
        await uow.tx.servicePrice.createMany({
          data: prices.map((price) => ({
            serviceId: id,
            organizationId: ctx.organizationId,
            currency: price.currency,
            amountMinor: BigInt(price.amountMinor),
          })),
        });
      }
      for (const price of prices) {
        await recordPriceChange(uow, ctx, id, price.currency, null, price.amountMinor, deps.clock());
      }
      await uow.audit.record({
        action: "CREATE",
        entityType: "service",
        entityId: id,
        summary: "Serviço criado",
        changes: diffChanges(null, {
          ...fields,
          prices: pricesForAudit(prices),
          allowedRoomIds: [...roomIds].sort(),
        }),
      });
      return ok({ serviceId: id, version: 1, priceChanged: prices.length > 0 });
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
  const { serviceId, version, allowedRoomIds, prices, ...fields } = parsed.value;
  const roomIds = fields.requiresRoom ? allowedRoomIds : [];
  const missing = await missingCurrencies(deps, ctx, prices);
  if (missing.length > 0) return fail(ServicesErrors.priceRequired(missing));

  try {
    return await withTransaction(ctx, async (uow) => {
      const before = await uow.tx.service.findFirst({
        where: { id: serviceId },
        include: {
          allowedRooms: { select: { roomId: true } },
          prices: { select: { currency: true, amountMinor: true } },
        },
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
      // PRD F03 and F16: every price change is stored per currency with its date and author;
      // appointments keep the price they snapshotted, so nothing else changes here.
      const previous = toPrices(before.prices);
      await uow.tx.servicePrice.deleteMany({ where: { serviceId } });
      if (prices.length > 0) {
        await uow.tx.servicePrice.createMany({
          data: prices.map((price) => ({
            serviceId,
            organizationId: ctx.organizationId,
            currency: price.currency,
            amountMinor: BigInt(price.amountMinor),
          })),
        });
      }
      let priceChanged = false;
      for (const price of prices) {
        const old = priceIn(previous, price.currency);
        if (old === price.amountMinor) continue;
        priceChanged = true;
        await recordPriceChange(uow, ctx, serviceId, price.currency, old, price.amountMinor, deps.clock());
      }
      await uow.audit.record({
        action: "UPDATE",
        entityType: "service",
        entityId: serviceId,
        summary: priceChanged ? "Serviço alterado (novo preço)" : "Serviço alterado",
        changes: diffChanges(
          { ...before, prices: pricesForAudit(previous), allowedRoomIds: [...linked].sort() },
          { ...fields, prices: pricesForAudit(prices), allowedRoomIds: [...roomIds].sort() },
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
        select: {
          id: true,
          changedAt: true,
          currency: true,
          previousAmountMinor: true,
          amountMinor: true,
          changedById: true,
        },
      }),
    );
  });
  if (!loaded.ok) return loaded;

  const authorIds = loaded.value.flatMap((change) => (change.changedById ? [change.changedById] : []));
  const names = await deps.users.namesOf(ctx, authorIds);
  return ok(
    loaded.value.flatMap(({ changedById, currency, previousAmountMinor, amountMinor, ...change }) =>
      !isCurrency(currency)
        ? []
        : [
            {
              ...change,
              currency,
              previousAmountMinor: previousAmountMinor === null ? null : Number(previousAmountMinor),
              amountMinor: Number(amountMinor),
              changedBy: changedById
                ? { id: changedById, name: names.get(changedById) ?? "Usuário removido" }
                : null,
            },
          ],
    ),
  );
}
