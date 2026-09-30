import { authorize } from "@/shared/authz/guard";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import type { Week } from "../domain/business-hours";
import { readWeek } from "./business-hours";
import { fromDbDate, toDbDate } from "./closures";
import { UnitsErrors } from "./errors";

// Read models provided to other features (PRD F02 Provides).

export type UnitSchedule = {
  unitId: string;
  name: string;
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
      select: { id: true, name: true, timeZone: true, active: true },
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

export type UnitContact = {
  name: string;
  phone: string | null;
  email: string | null;
  address: {
    street: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
    cep: string | null;
  };
  formattedAddress: string;
};

// "Avenida Paulista, 1000 - Sala 12 - Bela Vista, São Paulo/SP - CEP 01310-100"
export function formatAddress(address: UnitContact["address"]): string {
  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  const cityLine = [address.city, address.state].filter(Boolean).join("/");
  const districtCity = [address.district, cityLine].filter(Boolean).join(", ");
  const cep = address.cep ? `CEP ${address.cep.slice(0, 5)}-${address.cep.slice(5)}` : "";
  return [streetLine, address.complement, districtCity, cep].filter(Boolean).join(" - ");
}

// For F08 (document templates): name, address and phone.
export async function getUnitContact(ctx: RequestContext, unitId: string): Promise<Result<UnitContact>> {
  const allowed = await authorize(ctx, "setup:read");
  if (!allowed.ok) return allowed;
  return withTransaction(ctx, async (uow) => {
    const unit = await uow.tx.unit.findFirst({ where: { id: unitId } });
    if (!unit) return fail(UnitsErrors.notFound());
    const address = {
      street: unit.street,
      number: unit.number,
      complement: unit.complement,
      district: unit.district,
      city: unit.city,
      state: unit.state,
      cep: unit.cep,
    };
    return ok({
      name: unit.name,
      phone: unit.phone,
      email: unit.email,
      address,
      formattedAddress: formatAddress(address),
    });
  });
}
