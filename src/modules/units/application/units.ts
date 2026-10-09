import { authorize } from "@/shared/authz/guard";
import { diffChanges } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import type { CountryAddress } from "@/shared/kernel/address";
import { isCountryCode, currencyOf, type CountryCode, type Currency } from "@/shared/kernel/countries/codes";
import { taxIdSpec, normalizeTaxId, validateTaxId } from "@/shared/kernel/tax-id";
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
  country: CountryCode;
  currency: Currency;
  timeZone: string;
  active: boolean;
  activeRoomCount: number;
};

export type UnitDetails = {
  id: string;
  name: string;
  country: CountryCode;
  // Derived from the country and stored for queries (ADR-029); never edited directly.
  currency: Currency;
  // Normalized tax ID of the country.
  taxId: string | null;
  timeZone: string;
  // E.164.
  phone: string | null;
  email: string | null;
  address: {
    country: CountryCode;
    postalCode: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    city: string | null;
    region: string | null;
  };
  active: boolean;
  version: number;
};

type UnitRow = {
  id: string;
  name: string;
  country: string;
  currency: string;
  taxId: string | null;
  timeZone: string;
  phone: string | null;
  email: string | null;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
  active: boolean;
  version: number;
};

export function toDetails(row: UnitRow): UnitDetails {
  const country: CountryCode = isCountryCode(row.country) ? row.country : "BR";
  return {
    id: row.id,
    name: row.name,
    country,
    currency: currencyOf(country),
    taxId: row.taxId,
    timeZone: row.timeZone,
    phone: row.phone,
    email: row.email,
    address: {
      country,
      postalCode: row.postalCode,
      street: row.street,
      number: row.number,
      complement: row.complement,
      district: row.district,
      city: row.city,
      region: row.region,
    },
    active: row.active,
    version: row.version,
  };
}

// Services without a price in a currency the organization did not use before: the unit form warns
// about them so the Administrator prices them (PRD F16).
async function servicesWithoutPrice(
  deps: UnitsDeps,
  uow: UnitOfWork,
  organizationId: string,
  unitId: string,
  currency: Currency,
): Promise<{ id: string; name: string }[]> {
  const others = await uow.tx.unit.count({ where: { active: true, currency, id: { not: unitId } } });
  if (others > 0) return [];
  return deps.pricing().servicesWithoutPrice(organizationId, currency);
}

// The address columns of a unit: its country is the unit country, stored in the unit row.
function addressColumns(address: CountryAddress) {
  return {
    postalCode: address.postalCode,
    street: address.street,
    number: address.number,
    complement: address.complement,
    district: address.district,
    city: address.city,
    region: address.region,
  };
}

export type UnitSaved = {
  unitId: string;
  version: number;
  currency: Currency;
  servicesWithoutPrice: { id: string; name: string }[];
};

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
        country: true,
        currency: true,
        timeZone: true,
        active: true,
        _count: { select: { rooms: { where: { active: true } } } },
      },
    });
    return ok(
      rows.map(({ _count, country, ...unit }) => {
        const code: CountryCode = isCountryCode(country) ? country : "BR";
        return { ...unit, country: code, currency: currencyOf(code), activeRoomCount: _count.rooms };
      }),
    );
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
): Promise<Result<UnitSaved>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(createUnitSchema, input);
  if (!parsed.ok) return parsed;
  const { address, taxId: rawTaxId, ...fields } = parsed.value;
  if (rawTaxId && !validateTaxId(fields.country, rawTaxId)) {
    return fail(UnitsErrors.invalidTaxId(taxIdSpec(fields.country).shortLabel));
  }
  const taxId = rawTaxId ? normalizeTaxId(fields.country, rawTaxId) : null;
  const currency = currencyOf(fields.country);

  try {
    return await withTransaction(ctx, async (uow) => {
      if ((await uow.tx.unit.count({ where: { active: true } })) >= MAX_ACTIVE_UNITS) {
        return fail(UnitsErrors.unitLimit());
      }
      if (await nameTaken(uow, fields.name)) return fail(UnitsErrors.nameTaken());
      const id = newId();
      const data = { ...fields, taxId, currency, ...addressColumns(address) };
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
      return ok({
        unitId: id,
        version: 1,
        currency,
        servicesWithoutPrice: await servicesWithoutPrice(deps, uow, ctx.organizationId, id, currency),
      });
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
): Promise<Result<UnitSaved>> {
  const allowed = await authorize(ctx, "setup:manage");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(updateUnitSchema, input);
  if (!parsed.ok) return parsed;
  const { unitId, version, address, taxId: rawTaxId, ...fields } = parsed.value;
  if (rawTaxId && !validateTaxId(fields.country, rawTaxId)) {
    return fail(UnitsErrors.invalidTaxId(taxIdSpec(fields.country).shortLabel));
  }
  const taxId = rawTaxId ? normalizeTaxId(fields.country, rawTaxId) : null;
  const currency = currencyOf(fields.country);

  try {
    return await withTransaction(ctx, async (uow) => {
      const before = await uow.tx.unit.findFirst({ where: { id: unitId } });
      if (!before) return fail(UnitsErrors.notFound());
      if (await nameTaken(uow, fields.name, unitId)) return fail(UnitsErrors.nameTaken());
      // The country, and with it the currency, is fixed once the unit has appointments (PRD F16).
      if (
        before.country !== fields.country &&
        ((await deps.appointments().hasAnyInUnit(ctx.organizationId, unitId)) ||
          (await deps.financialRecords().hasAnyInUnit(ctx.organizationId, unitId)))
      ) {
        return fail(UnitsErrors.countryLocked());
      }
      const data = { ...fields, taxId, currency, ...addressColumns(address) };
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
      return ok({
        unitId,
        version: version + 1,
        currency,
        servicesWithoutPrice:
          before.currency === currency
            ? []
            : await servicesWithoutPrice(deps, uow, ctx.organizationId, unitId, currency),
      });
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
