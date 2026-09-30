import { authorize } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { isValidCnpj } from "@/shared/kernel/cnpj";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { MAX_ACTIVE_UNITS } from "../domain/limits";
import { UnitsErrors } from "./errors";
import type { UnitsDeps } from "./ports";
import { createUnitSchema, setUnitActiveSchema, updateUnitSchema } from "./schemas";

export type UnitSummary = {
  id: string;
  name: string;
  city: string | null;
  timeZone: string;
  active: boolean;
  activeRoomCount: number;
};

export type UnitDetails = {
  id: string;
  name: string;
  cnpj: string | null;
  timeZone: string;
  phone: string | null;
  email: string | null;
  address: {
    cep: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
  };
  active: boolean;
  version: number;
};

type UnitRow = Omit<UnitDetails, "address"> & UnitDetails["address"];

export function toDetails(row: UnitRow): UnitDetails {
  const { cep, street, number, complement, district, city, state, ...rest } = row;
  return {
    id: rest.id,
    name: rest.name,
    cnpj: rest.cnpj,
    timeZone: rest.timeZone,
    phone: rest.phone,
    email: rest.email,
    address: { cep, street, number, complement, district, city, state },
    active: rest.active,
    version: rest.version,
  };
}

// Case-insensitive name check for a friendly message; the unique index is the guarantee.
async function nameTaken(uow: UnitOfWork, name: string, exceptId?: string): Promise<boolean> {
  const existing = await uow.tx.unit.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  return !!existing;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "P2002";
}

export async function listUnits(
  ctx: RequestContext,
  options: { activeOnly?: boolean } = {},
): Promise<Result<UnitSummary[]>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const rows = await uow.tx.unit.findMany({
      where: options.activeOnly ? { active: true } : {},
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        city: true,
        timeZone: true,
        active: true,
        _count: { select: { rooms: { where: { active: true } } } },
      },
    });
    return ok(rows.map(({ _count, ...unit }) => ({ ...unit, activeRoomCount: _count.rooms })));
  });
}

export async function getUnit(ctx: RequestContext, unitId: string): Promise<Result<UnitDetails>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const row = await uow.tx.unit.findFirst({ where: { id: unitId } });
    return row ? ok(toDetails(row)) : fail(UnitsErrors.notFound());
  });
}

export async function createUnit(
  deps: UnitsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ unitId: string; version: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createUnitSchema, input);
  if (!parsed.ok) return parsed;
  const { address, ...fields } = parsed.value;
  if (fields.cnpj && !isValidCnpj(fields.cnpj)) return fail(UnitsErrors.invalidCnpj());

  try {
    return await withTransaction(ctx, async (uow) => {
      if ((await uow.tx.unit.count({ where: { active: true } })) >= MAX_ACTIVE_UNITS) {
        return fail(UnitsErrors.unitLimit());
      }
      if (await nameTaken(uow, fields.name)) return fail(UnitsErrors.nameTaken());
      const id = newId();
      const data = { ...fields, ...address };
      await uow.tx.unit.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          ...data,
          createdById: ctx.user.id,
          updatedById: ctx.user.id,
        },
      });
      await uow.audit.record({
        action: "CREATE",
        entityType: "unit",
        entityId: id,
        summary: "Unidade criada",
        changes: diffChanges(null, data),
      });
      return ok({ unitId: id, version: 1 });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(UnitsErrors.nameTaken());
    throw error;
  }
}

export async function updateUnit(
  deps: UnitsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ unitId: string; version: number }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateUnitSchema, input);
  if (!parsed.ok) return parsed;
  const { unitId, version, address, ...fields } = parsed.value;
  if (fields.cnpj && !isValidCnpj(fields.cnpj)) return fail(UnitsErrors.invalidCnpj());

  try {
    return await withTransaction(ctx, async (uow) => {
      const before = await uow.tx.unit.findFirst({ where: { id: unitId } });
      if (!before) return fail(UnitsErrors.notFound());
      if (await nameTaken(uow, fields.name, unitId)) return fail(UnitsErrors.nameTaken());
      const data = { ...fields, ...address };
      const updated = await uow.tx.unit.updateMany({
        where: { id: unitId, version },
        data: { ...data, version: { increment: 1 }, updatedById: ctx.user.id },
      });
      if (updated.count !== 1) return fail(CommonErrors.staleVersion());
      await uow.audit.record({
        action: "UPDATE",
        entityType: "unit",
        entityId: unitId,
        summary: "Unidade alterada",
        changes: diffChanges(before, data),
      });
      return ok({ unitId, version: version + 1 });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(UnitsErrors.nameTaken());
    throw error;
  }
}

export async function setUnitActive(
  deps: UnitsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ active: boolean }>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(setUnitActiveSchema, input);
  if (!parsed.ok) return parsed;
  const { unitId, active } = parsed.value;

  if (!active) {
    // Spec F02 assumption: a unit with future appointments cannot be deactivated (same rule as rooms).
    const future = await deps.appointments().countFutureInUnit(ctx.organizationId, unitId, deps.clock());
    if (future > 0) return fail(UnitsErrors.unitHasAppointments(future));
  }

  return withTransaction(ctx, async (uow) => {
    const unit = await uow.tx.unit.findFirst({ where: { id: unitId } });
    if (!unit) return fail(UnitsErrors.notFound());
    if (unit.active === active) return ok({ active });
    if (active && (await uow.tx.unit.count({ where: { active: true } })) >= MAX_ACTIVE_UNITS) {
      return fail(UnitsErrors.unitLimit());
    }
    await uow.tx.unit.update({
      where: { id: unitId },
      data: { active, version: { increment: 1 }, updatedById: ctx.user.id },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "unit",
      entityId: unitId,
      summary: active ? "Unidade reativada" : "Unidade desativada",
      changes: { active: { before: !active, after: active } },
    });
    return ok({ active });
  });
}
