import { billing } from "@/modules/billing";
import { cash } from "@/modules/cash";
import { db } from "@/shared/db/client";
import { addDays } from "@/shared/kernel/calendar-date";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import {
  billingWorld,
  manualCharge,
  mustReceive,
  receive,
  type BillingWorld,
  type Ctx,
} from "../billing/support";

export { billingWorld, manualCharge, mustReceive, receive, addDays };
export type { BillingWorld, Ctx };

export const REASON = "Motivo de teste do caixa";

// "Today" in the unit's time zone: the business date of a payment made now.
export async function today(world: BillingWorld, unitId = world.unitId): Promise<string> {
  const unit = await db().unit.findUniqueOrThrow({ where: { id: unitId } });
  return dateInTimeZone(new Date(), unit.timeZone);
}

export async function mustOpen(
  world: BillingWorld,
  overrides: Record<string, unknown> = {},
  ctx: Ctx = world.desk,
) {
  const opened = await cash.openRegister(ctx, {
    unitId: world.unitId,
    businessDate: await today(world),
    openingMinor: 0,
    ...overrides,
  });
  if (!opened.ok) throw new Error(`openRegister failed: ${opened.error.code}`);
  return opened.value.register;
}

// A payment of the day in the BRL unit, through billing.
export async function pay(world: BillingWorld, amountMinor: number, method = "PIX") {
  const charge = await manualCharge(world, amountMinor);
  return mustReceive(world, charge.id, amountMinor, method);
}

export async function mustClose(
  world: BillingWorld,
  registerId: string,
  countedMinor: number,
  justification: string | null = null,
  ctx: Ctx = world.desk,
) {
  const closed = await cash.closeRegister(ctx, { registerId, countedMinor, justification });
  if (!closed.ok) throw new Error(`closeRegister failed: ${closed.error.code}`);
  return closed.value;
}

export async function categoryId(
  world: BillingWorld,
  kind: "EXPENSE" | "REVENUE" | "TRANSFER",
  name?: string,
) {
  const listed = await cash.listCategories(world.manager);
  if (!listed.ok) throw new Error(`listCategories failed: ${listed.error.code}`);
  const found = listed.value.find((category) => category.kind === kind && (!name || category.name === name));
  if (!found) throw new Error(`no ${kind} category`);
  return found.id;
}

export async function mustMove(
  world: BillingWorld,
  registerId: string,
  direction: "IN" | "OUT",
  amountMinor: number,
  overrides: Record<string, unknown> = {},
  ctx: Ctx = world.desk,
) {
  const moved = await cash.recordMovement(ctx, {
    registerId,
    direction,
    amountMinor,
    description: direction === "IN" ? "Entrada de teste" : "Compra de material de limpeza",
    categoryId: await categoryId(world, direction === "IN" ? "REVENUE" : "EXPENSE"),
    ...overrides,
  });
  if (!moved.ok) throw new Error(`recordMovement failed: ${moved.error.code}`);
  return moved.value.movement;
}

export async function entryInput(world: BillingWorld, overrides: Record<string, unknown> = {}) {
  return {
    kind: "EXPENSE",
    description: "Aluguel da sala 3",
    categoryId: await categoryId(world, "EXPENSE", "Aluguel"),
    unitId: world.unitId,
    currency: "BRL",
    amountMinor: 350_000,
    dueDate: addDays(await today(world), 5),
    ...overrides,
  };
}

export async function mustCreateEntry(world: BillingWorld, overrides: Record<string, unknown> = {}) {
  const created = await cash.createEntry(world.manager, await entryInput(world, overrides));
  if (!created.ok)
    throw new Error(`createEntry failed: ${created.error.code} ${JSON.stringify(created.error.fields)}`);
  return created.value;
}

export { billing, cash };
