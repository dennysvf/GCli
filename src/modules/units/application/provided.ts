import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { formatCountryAddress, type CountryAddress } from "@/shared/kernel/address";
import { currencyOf, isCountryCode, type CountryCode, type Currency } from "@/shared/kernel/countries/codes";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import type { Week } from "../domain/business-hours";
import { readWeek } from "./business-hours";
import { fromDbDate, toDbDate } from "./closures";
import { UnitsErrors } from "./errors";

// Read models provided to other features (PRD F02 Provides).

export type UnitSchedule = {
  unitId: string;
  name: string;
  country: CountryCode;
  currency: Currency;
  timeZone: string;
  active: boolean;
  businessHours: Week;
  closures: { startsOn: string; endsOn: string; reason: string }[];
  rooms: { id: string; name: string; active: boolean }[];
};

// For F04 (working hours) and F06 (booking): hours, upcoming closures, rooms and time zone.
export async function getUnitSchedule(
  ctx: RequestContext,
  unitId: string,
  now: Date = new Date(),
): Promise<Result<UnitSchedule>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const unit = await uow.tx.unit.findFirst({
      where: { id: unitId },
      select: { id: true, name: true, country: true, timeZone: true, active: true },
    });
    if (!unit) return fail(UnitsErrors.notFound());
    const today = toDbDate(dateInTimeZone(now, unit.timeZone));
    const [businessHours, closures, rooms] = await Promise.all([
      readWeek(uow, unitId),
      uow.tx.unitClosure.findMany({
        where: { unitId, endsOn: { gte: today } },
        orderBy: { startsOn: "asc" },
      }),
      uow.tx.room.findMany({
        where: { unitId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, active: true },
      }),
    ]);
    return ok({
      unitId: unit.id,
      name: unit.name,
      country: toCountry(unit.country),
      currency: currencyOf(toCountry(unit.country)),
      timeZone: unit.timeZone,
      active: unit.active,
      businessHours,
      closures: closures.map((row) => ({
        startsOn: fromDbDate(row.startsOn),
        endsOn: fromDbDate(row.endsOn),
        reason: row.reason,
      })),
      rooms,
    });
  });
}

function toCountry(value: string): CountryCode {
  return isCountryCode(value) ? value : "BR";
}

export type UnitContact = {
  name: string;
  country: CountryCode;
  // E.164.
  phone: string | null;
  email: string | null;
  address: CountryAddress;
  formattedAddress: string;
};

// For F08 (document templates): name, address and phone.
export async function getUnitContact(ctx: RequestContext, unitId: string): Promise<Result<UnitContact>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const unit = await uow.tx.unit.findFirst({ where: { id: unitId } });
    if (!unit) return fail(UnitsErrors.notFound());
    const country = toCountry(unit.country);
    const address: CountryAddress = {
      country,
      postalCode: unit.postalCode,
      street: unit.street,
      number: unit.number,
      complement: unit.complement,
      district: unit.district,
      city: unit.city,
      region: unit.region,
    };
    return ok({
      name: unit.name,
      country,
      phone: unit.phone,
      email: unit.email,
      address,
      formattedAddress: formatCountryAddress(address),
    });
  });
}

export { formatCountryAddress as formatUnitAddress };
