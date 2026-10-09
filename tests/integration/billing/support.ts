import { billing } from "@/modules/billing";
import { identity } from "@/modules/identity";
import { scheduling } from "@/modules/scheduling";
import { units } from "@/modules/units";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { DEFAULT_PASSWORD, type signedInContext } from "../helpers";
import { fullWeek } from "../units/support";
import { h } from "../professionals/support";
import { booking, bookOrThrow, day, schedulingWorld, type Ctx, type World } from "../scheduling/support";

export type { Ctx, World };

export const MANAGER_PIN = "402719";

const PT_UNIT = {
  name: "Unidade Lisboa",
  country: "PT",
  timeZone: "Europe/Lisbon",
  phone: "912 345 678",
  email: null,
  address: { postalCode: "1100053", street: "Rua Augusta", number: "5", city: "Lisboa", region: "Lisboa" },
};

// The scheduling clinic (a Brazilian unit, R$ 250,00 and R$ 120,00 services) plus a second user
// of each billing role, a Manager with an approval PIN and a Portuguese unit (EUR).
export async function billingWorld() {
  const world = await schedulingWorld();
  const pin = await identity.setApprovalPin(world.manager, {
    currentPassword: DEFAULT_PASSWORD,
    pin: MANAGER_PIN,
    confirmation: MANAGER_PIN,
  });
  if (!pin.ok) throw new Error(`setApprovalPin failed: ${pin.error.code}`);

  const created = await units.createUnit(world.admin, PT_UNIT);
  if (!created.ok) throw new Error(`createUnit failed: ${created.error.code}`);
  const saved = await units.replaceBusinessHours(world.admin, {
    unitId: created.value.unitId,
    days: fullWeek(
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, intervals: [{ start: h(8), end: h(18) }] })),
    ),
  });
  if (!saved.ok) throw new Error(`replaceBusinessHours failed: ${saved.error.code}`);
  return { ...world, ptUnitId: created.value.unitId };
}

export type BillingWorld = Awaited<ReturnType<typeof billingWorld>>;

export async function moveTo(ctx: Ctx, appointmentId: string, statuses: string[]) {
  for (const to of statuses) {
    const current = await db().appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    const result = await scheduling.changeAppointmentStatus(ctx, {
      appointmentId,
      version: current.version,
      to,
    });
    if (!result.ok) throw new Error(`status ${to} failed: ${result.error.code}`);
  }
}

// Books an appointment tomorrow and returns its ID; `status` moves it along the lifecycle.
export async function appointmentAt(
  world: BillingWorld,
  options: { status?: string[]; startTime?: string; serviceId?: string } = {},
) {
  const booked = await bookOrThrow(
    world.desk,
    booking(world, {
      date: day(1),
      startTime: options.startTime ?? "10:00",
      ...(options.serviceId ? { serviceId: options.serviceId } : {}),
    }),
  );
  if (options.status) await moveTo(world.desk, booked.appointmentId, options.status);
  return booked.appointmentId;
}

export async function chargeOf(appointmentId: string) {
  return db().charge.findFirst({ where: { appointmentId }, include: { payments: true } });
}

export async function chargeFor(appointmentId: string) {
  const charge = await chargeOf(appointmentId);
  if (!charge) throw new Error("no charge for the appointment");
  return charge;
}

// A manual charge of the front desk (R$ 200,00 by default).
export async function manualCharge(world: BillingWorld, grossMinor = 20_000, ctx: Ctx = world.desk) {
  const created = await billing.createManualCharge(ctx, {
    patientId: world.patients.maria,
    unitId: world.unitId,
    description: "Venda de produto",
    grossMinor,
  });
  if (!created.ok) throw new Error(`createManualCharge failed: ${created.error.code}`);
  return created.value;
}

export function receiveInput(
  world: BillingWorld,
  chargeId: string,
  payments: { method: string; amountMinor: number; installments?: number }[],
  overrides: Record<string, unknown> = {},
) {
  return { chargeId, submissionKey: newId(), unitId: world.unitId, payments, ...overrides };
}

export async function receive(
  world: BillingWorld,
  chargeId: string,
  payments: { method: string; amountMinor: number; installments?: number }[],
  overrides: Record<string, unknown> = {},
  ctx: Ctx = world.desk,
) {
  return billing.receivePayment(ctx, receiveInput(world, chargeId, payments, overrides));
}

export async function mustReceive(
  world: BillingWorld,
  chargeId: string,
  amountMinor: number,
  method = "PIX",
  ctx: Ctx = world.desk,
) {
  const line = method === "CREDIT_CARD" ? { method, amountMinor, installments: 1 } : { method, amountMinor };
  const result = await receive(world, chargeId, [line], {}, ctx);
  if (!result.ok) throw new Error(`receivePayment failed: ${result.error.code}`);
  return result.value;
}

export type SignedIn = Awaited<ReturnType<typeof signedInContext>>;
