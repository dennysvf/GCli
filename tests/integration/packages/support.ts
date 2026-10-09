import { packages } from "@/modules/packages";
import { scheduling } from "@/modules/scheduling";
import { db } from "@/shared/db/client";
import { isoWeekday } from "@/shared/kernel/calendar-date";
import { billingWorld, moveTo, type BillingWorld } from "../billing/support";
import { booking, bookOrThrow, day, type Ctx } from "../scheduling/support";

export { billingWorld, moveTo, type BillingWorld };
export { day };

export type PackagesWorld = BillingWorld;

export async function templateFor(
  world: BillingWorld,
  overrides: Record<string, unknown> = {},
  ctx: Ctx = world.manager,
) {
  const saved = await packages.saveTemplate(ctx, {
    name: "Consulta 10 sessões",
    serviceId: world.services.consulta,
    sessions: 10,
    validityDays: 180,
    prices: [{ currency: "BRL", amountMinor: 150_000 }],
    ...overrides,
  });
  if (!saved.ok)
    throw new Error(`saveTemplate failed: ${saved.error.code} ${JSON.stringify(saved.error.fields)}`);
  return saved.value.templateId;
}

// Sells a package to Maria at the BRL unit (the template price unless another one is given).
export async function sellFor(
  world: BillingWorld,
  templateId: string,
  overrides: Record<string, unknown> = {},
  ctx: Ctx = world.desk,
) {
  return packages.sellPackage(ctx, {
    patientId: world.patients.maria,
    templateId,
    unitId: world.unitId,
    priceMinor: 150_000,
    ...overrides,
  });
}

export async function soldPackage(
  world: BillingWorld,
  templateOverrides: Record<string, unknown> = {},
  saleOverrides: Record<string, unknown> = {},
) {
  const templateId = await templateFor(world, templateOverrides);
  const sale = await sellFor(world, templateId, saleOverrides);
  if (!sale.ok) throw new Error(`sellPackage failed: ${sale.error.code}`);
  return sale.value;
}

// Books an appointment of Maria's package service tomorrow, linked to the package.
export async function bookLinked(
  world: BillingWorld,
  packageId: string | null,
  overrides: Record<string, unknown> = {},
) {
  return scheduling.bookAppointment(world.desk, {
    ...booking(world, { date: day(1), startTime: "10:00", ...overrides }),
    ...(packageId ? { packageId } : {}),
  });
}

export async function mustBookLinked(
  world: BillingWorld,
  packageId: string | null,
  overrides: Record<string, unknown> = {},
) {
  const booked = await bookLinked(world, packageId, overrides);
  if (!booked.ok) throw new Error(`book failed: ${booked.error.code}`);
  return booked.value.appointmentId;
}

export async function linkOf(appointmentId: string) {
  return db().packageAppointment.findFirst({ where: { appointmentId }, orderBy: { linkedAt: "desc" } });
}

export async function packageRow(packageId: string) {
  return db().patientPackage.findUniqueOrThrow({ where: { id: packageId } });
}

export function seriesOf(world: BillingWorld, packageId: string, count: number) {
  const first = day(2);
  return {
    ...booking(world, { date: first, startTime: "09:00" }),
    packageId,
    recurrence: { frequency: "WEEKLY", weekdays: [isoWeekday(first)], endsAfter: count, endsOn: null },
  };
}

export { bookOrThrow };
