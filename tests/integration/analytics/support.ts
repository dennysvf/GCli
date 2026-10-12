import {
  createAnalytics,
  createTtlCache,
  type DashboardFigures,
  type OrganizationHeaderLookup,
  type ReportExport,
  type ReportPdfDocument,
  type ReportPdfRenderer,
  type ViewCell,
} from "@/modules/analytics";
import { cash } from "@/modules/cash";
import { db } from "@/shared/db/client";
import { addDays } from "@/shared/kernel/calendar-date";
import { newId } from "@/shared/kernel/ids";
import { zonedTimeToUtc } from "@/shared/kernel/zoned-time";
import { billingWorld, type BillingWorld } from "../billing/support";
import { day, firstReasonId } from "../scheduling/support";

export { addDays, billingWorld, day };
export type { BillingWorld };

const SP = "America/Sao_Paulo";
const LISBON = "Europe/Lisbon";

// A dashboard with a fresh cache, so earlier tests never answer for this one.
export function freshAnalytics(clock: () => Date = () => new Date()) {
  return createAnalytics((base) => ({ ...base, clock, cache: createTtlCache<DashboardFigures>({ clock }) }));
}

// The dashboard is read-only, so its tests write the source rows directly: that is the only way to
// place appointments, charges and payments on chosen dates and statuses (spec F12 section 7).

export function localInstant(date: string, time: string, zone = SP): Date {
  return zonedTimeToUtc(`${date}T${time}`, zone);
}

export async function insertAppointment(
  world: BillingWorld,
  input: {
    date: string;
    time: string;
    minutes: number;
    status: string;
    professionalId?: string;
    unitId?: string;
    zone?: string;
    currency?: string;
    overbooking?: boolean;
    patientId?: string;
  },
) {
  const startsAt = localInstant(input.date, input.time, input.zone ?? SP);
  const cancelled = input.status === "CANCELLED";
  const id = newId();
  await db().appointment.create({
    data: {
      id,
      organizationId: world.organizationId,
      unitId: input.unitId ?? world.unitId,
      professionalId: input.professionalId ?? world.professionals.ana,
      serviceId: world.services.retorno,
      patientId: input.patientId ?? world.patients.maria,
      startsAt,
      endsAt: new Date(startsAt.getTime() + input.minutes * 60_000),
      durationMinutes: input.minutes,
      priceMinor: 25_000n,
      currency: input.currency ?? "BRL",
      status: input.status,
      isOverbooking: input.overbooking ?? false,
      ...(cancelled
        ? {
            cancellationOrigin: "PATIENT",
            cancellationReasonId: await firstReasonId(world.manager),
            cancelledAt: startsAt,
          }
        : {}),
    },
  });
  return id;
}

let chargeSequence = 0;

// A charge created at a local instant, with its payments (each paid at its own local instant).
export async function insertCharge(
  world: BillingWorld,
  input: {
    createdAt: Date;
    grossMinor: number;
    discountMinor?: number;
    status: "PENDING_APPROVAL" | "OPEN" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
    professionalId?: string | null;
    unitId?: string;
    currency?: string;
    payments?: { amountMinor: number; at: Date; refund?: { amountMinor: number; at: Date } }[];
  },
) {
  const discountMinor = input.discountMinor ?? 0;
  const netMinor = input.grossMinor - discountMinor;
  const payments = input.payments ?? [];
  const paidMinor = payments.reduce(
    (sum, payment) => sum + payment.amountMinor - (payment.refund?.amountMinor ?? 0),
    0,
  );
  const unitId = input.unitId ?? world.unitId;
  const currency = input.currency ?? "BRL";
  const id = newId();
  chargeSequence += 1;
  const cancelled = input.status === "CANCELLED";
  await db().charge.create({
    data: {
      id,
      organizationId: world.organizationId,
      number: `T-${String(chargeSequence).padStart(6, "0")}`,
      patientId: world.patients.maria,
      origin: "MANUAL",
      description: "Atendimento de teste",
      professionalId: input.professionalId === undefined ? world.professionals.ana : input.professionalId,
      unitId,
      currency,
      grossMinor: BigInt(input.grossMinor),
      discountMinor: BigInt(discountMinor),
      ...(discountMinor > 0 ? { discountKind: "AMOUNT", discountValue: discountMinor } : {}),
      netMinor: BigInt(netMinor),
      paidMinor: BigInt(paidMinor),
      status: input.status,
      createdById: world.desk.user.id,
      createdAt: input.createdAt,
      ...(cancelled
        ? {
            cancelledAt: input.createdAt,
            cancelledById: world.manager.user.id,
            cancelReason: "Cancelada em teste",
          }
        : {}),
    },
  });
  for (const payment of payments) {
    const submissionId = newId();
    await db().paymentSubmission.create({
      data: {
        organizationId: world.organizationId,
        id: submissionId,
        chargeId: id,
        userId: world.desk.user.id,
      },
    });
    const paymentId = newId();
    await db().payment.create({
      data: {
        id: paymentId,
        organizationId: world.organizationId,
        chargeId: id,
        kind: "PAYMENT",
        submissionId,
        method: "PIX",
        amountMinor: BigInt(payment.amountMinor),
        refundedMinor: BigInt(payment.refund?.amountMinor ?? 0),
        currency,
        unitId,
        receivedAt: payment.at,
        userId: world.desk.user.id,
      },
    });
    if (payment.refund) {
      await db().payment.create({
        data: {
          id: newId(),
          organizationId: world.organizationId,
          chargeId: id,
          kind: "REFUND",
          refundedPaymentId: paymentId,
          method: "PIX",
          amountMinor: BigInt(-payment.refund.amountMinor),
          currency,
          unitId,
          receivedAt: payment.refund.at,
          userId: world.desk.user.id,
          reason: "Estorno de teste",
        },
      });
    }
  }
  return id;
}

async function categoryOf(world: BillingWorld, kind: "EXPENSE" | "REVENUE" | "TRANSFER") {
  const listed = await cash.listCategories(world.manager);
  if (!listed.ok) throw new Error(listed.error.code);
  const found = listed.value.find((category) => category.kind === kind);
  if (!found) throw new Error(`no ${kind} category`);
  return found.id;
}

// A paid expense or revenue; `reversed` keeps the payment but reverses it.
export async function insertPaidEntry(
  world: BillingWorld,
  input: {
    kind: "EXPENSE" | "REVENUE";
    amountMinor: number;
    paidOn: string;
    unitId?: string | null;
    reversed?: boolean;
  },
) {
  const entryId = newId();
  await db().financialEntry.create({
    data: {
      id: entryId,
      organizationId: world.organizationId,
      kind: input.kind,
      description: input.kind === "EXPENSE" ? "Despesa de teste" : "Receita de teste",
      categoryId: await categoryOf(world, input.kind),
      unitId: input.unitId === undefined ? world.unitId : input.unitId,
      currency: "BRL",
      amountMinor: BigInt(input.amountMinor),
      dueDate: new Date(`${input.paidOn}T00:00:00Z`),
      status: input.reversed ? "PENDING" : "PAID",
      createdById: world.manager.user.id,
    },
  });
  await db().financialEntryPayment.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      entryId,
      paidOn: new Date(`${input.paidOn}T00:00:00Z`),
      method: "PIX",
      amountMinor: BigInt(input.amountMinor),
      currency: "BRL",
      recordedById: world.manager.user.id,
      ...(input.reversed
        ? {
            reversedAt: new Date(),
            reversedById: world.manager.user.id,
            reversalReason: "Estorno de teste do lançamento",
          }
        : {}),
    },
  });
}

// A register of the SP unit on a business date with manual movements.
export async function insertRegister(
  world: BillingWorld,
  businessDate: string,
  movements: {
    direction: "IN" | "OUT";
    amountMinor: number;
    kind: "EXPENSE" | "REVENUE" | "TRANSFER";
    reversed?: boolean;
  }[],
) {
  const registerId = newId();
  await db().cashRegister.create({
    data: {
      id: registerId,
      organizationId: world.organizationId,
      unitId: world.unitId,
      businessDate: new Date(`${businessDate}T00:00:00Z`),
      currency: "BRL",
      openingMinor: 0n,
      suggestedOpeningMinor: 0n,
      openedById: world.desk.user.id,
    },
  });
  for (const movement of movements) {
    await db().cashMovement.create({
      data: {
        id: newId(),
        organizationId: world.organizationId,
        registerId,
        direction: movement.direction,
        amountMinor: BigInt(movement.amountMinor),
        currency: "BRL",
        description: "Movimentação de teste",
        categoryId: await categoryOf(world, movement.kind),
        createdById: world.desk.user.id,
        ...(movement.reversed
          ? {
              reversedAt: new Date(),
              reversedById: world.manager.user.id,
              reversalReason: "Estorno de teste do caixa",
            }
          : {}),
      },
    });
  }
}

export async function setPatientCreatedAt(patientId: string, createdAt: Date) {
  await db().patient.update({ where: { id: patientId }, data: { createdAt } });
}

// The controlled dataset of spec F12 section 7. The period P is 7 future days, so the professionals'
// schedules (every day 08:00–18:00 in the SP unit, valid from today) cover it and its previous
// period. Expected values are computed by hand next to each row.
export async function controlledDataset(world: BillingWorld) {
  const from = day(20);
  const to = addDays(from, 6);
  const { ana, bruno } = world.professionals;

  // Appointments: 8 in the SP unit, 1 in the Lisbon unit.
  await insertAppointment(world, { date: from, time: "08:00", minutes: 60, status: "COMPLETED" });
  await insertAppointment(world, { date: from, time: "09:00", minutes: 60, status: "COMPLETED" });
  await insertAppointment(world, { date: from, time: "10:00", minutes: 60, status: "NO_SHOW" });
  await insertAppointment(world, { date: from, time: "11:00", minutes: 60, status: "SCHEDULED" });
  // Encaixe over 11:00–12:00: the union 11:00–12:30 counts 90 minutes.
  await insertAppointment(world, {
    date: from,
    time: "11:30",
    minutes: 60,
    status: "SCHEDULED",
    overbooking: true,
  });
  await insertAppointment(world, { date: from, time: "13:00", minutes: 60, status: "CANCELLED" });
  // 17:30–18:30: only 30 minutes are inside the working hours.
  await insertAppointment(world, { date: from, time: "17:30", minutes: 60, status: "SCHEDULED" });
  await insertAppointment(world, {
    date: addDays(from, 1),
    time: "08:00",
    minutes: 50,
    status: "COMPLETED",
    professionalId: bruno,
  });
  // Lisbon (EUR), late at night: outside the SP working hours, so no booked minutes.
  await insertAppointment(world, {
    date: from,
    time: "22:00",
    minutes: 60,
    status: "COMPLETED",
    professionalId: bruno,
    unitId: world.ptUnitId,
    zone: LISBON,
    currency: "EUR",
  });

  // Availability: Ana takes 4 hours off on day 3; the SP unit is closed on day 4.
  await db().professionalTimeOff.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      professionalId: ana,
      type: "VACATION",
      startsAt: localInstant(addDays(from, 2), "08:00"),
      endsAt: localInstant(addDays(from, 2), "12:00"),
    },
  });
  await db().unitClosure.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      unitId: world.unitId,
      startsOn: new Date(`${addDays(from, 3)}T00:00:00Z`),
      endsOn: new Date(`${addDays(from, 3)}T00:00:00Z`),
      reason: "Feriado municipal",
    },
  });

  // Charges and payments.
  await insertCharge(world, {
    createdAt: localInstant(from, "12:00"),
    grossMinor: 25_000,
    status: "PAID",
    payments: [{ amountMinor: 25_000, at: localInstant(from, "12:05") }],
  });
  await insertCharge(world, {
    createdAt: localInstant(addDays(from, 1), "12:00"),
    grossMinor: 25_000,
    discountMinor: 5_000,
    status: "PARTIALLY_PAID",
    payments: [{ amountMinor: 10_000, at: localInstant(addDays(from, 1), "12:05") }],
  });
  await insertCharge(world, {
    createdAt: localInstant(addDays(from, 2), "12:00"),
    grossMinor: 12_000,
    status: "OPEN",
    professionalId: bruno,
  });
  await insertCharge(world, {
    createdAt: localInstant(addDays(from, 2), "13:00"),
    grossMinor: 30_000,
    status: "CANCELLED",
  });
  // Manual sale without a professional, partly refunded the next day.
  await insertCharge(world, {
    createdAt: localInstant(addDays(from, 3), "12:00"),
    grossMinor: 5_000,
    status: "PARTIALLY_PAID",
    professionalId: null,
    payments: [
      {
        amountMinor: 5_000,
        at: localInstant(addDays(from, 3), "12:05"),
        refund: { amountMinor: 2_000, at: localInstant(addDays(from, 4), "09:00") },
      },
    ],
  });
  await insertCharge(world, {
    createdAt: localInstant(from, "21:00", LISBON),
    grossMinor: 8_000,
    status: "PAID",
    professionalId: bruno,
    unitId: world.ptUnitId,
    currency: "EUR",
    payments: [{ amountMinor: 8_000, at: localInstant(from, "21:05", LISBON) }],
  });
  // Previous period: created and paid the day before P.
  await insertCharge(world, {
    createdAt: localInstant(addDays(from, -1), "12:00"),
    grossMinor: 10_000,
    status: "PAID",
    payments: [{ amountMinor: 10_000, at: localInstant(addDays(from, -1), "12:05") }],
  });
  // Created in the previous period, paid inside P.
  await insertCharge(world, {
    createdAt: localInstant(addDays(from, -2), "12:00"),
    grossMinor: 4_000,
    status: "PAID",
    professionalId: bruno,
    payments: [{ amountMinor: 4_000, at: localInstant(addDays(from, 5), "10:00") }],
  });

  // Expenses and revenues.
  await insertPaidEntry(world, { kind: "EXPENSE", amountMinor: 30_000, paidOn: addDays(from, 1) });
  await insertPaidEntry(world, { kind: "REVENUE", amountMinor: 5_000, paidOn: addDays(from, 2) });
  await insertPaidEntry(world, {
    kind: "EXPENSE",
    amountMinor: 1_000,
    paidOn: addDays(from, 2),
    unitId: null,
  });
  await insertPaidEntry(world, {
    kind: "EXPENSE",
    amountMinor: 9_999,
    paidOn: addDays(from, 3),
    reversed: true,
  });
  await insertRegister(world, addDays(from, 4), [
    { direction: "IN", amountMinor: 700, kind: "REVENUE" },
    { direction: "OUT", amountMinor: 300, kind: "EXPENSE" },
    { direction: "OUT", amountMinor: 2_000, kind: "TRANSFER" },
    { direction: "OUT", amountMinor: 400, kind: "EXPENSE", reversed: true },
  ]);

  // New patients: Maria is registered inside P; João stays registered today.
  await setPatientCreatedAt(world.patients.maria, localInstant(from, "07:00"));

  return { from, to };
}

export function custom(period: { from: string; to: string }, overrides: Record<string, unknown> = {}) {
  return {
    period: "CUSTOM",
    from: period.from,
    to: period.to,
    unit: "ALL",
    professional: "ALL",
    ...overrides,
  };
}

export function amounts(kpi: { lines: { currency: string; amountMinor: string }[] } | null) {
  return Object.fromEntries((kpi?.lines ?? []).map((line) => [line.currency, Number(line.amountMinor)]));
}

// Reports with a fake PDF renderer that keeps the documents it receives, so tests read what would
// be printed (spec F13 section 7). `realPdf` keeps the real renderer.
export function freshReports(
  options: { clock?: () => Date; header?: OrganizationHeaderLookup; realPdf?: boolean } = {},
) {
  const documents: ReportPdfDocument[] = [];
  const pdf: ReportPdfRenderer = {
    render: async (document) => {
      documents.push(document);
      return Buffer.from("%PDF-fake");
    },
  };
  const clock = options.clock ?? (() => new Date());
  const api = createAnalytics((base) => ({
    ...base,
    clock,
    cache: createTtlCache<DashboardFigures>({ clock }),
    ...(options.header ? { organizationHeader: options.header } : {}),
    ...(options.realPdf ? {} : { pdf }),
  }));
  return { api, documents };
}

export async function readBody(body: ReportExport["body"]): Promise<string> {
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    // ignoreBOM keeps the BOM, which is part of what the export must deliver.
    const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
    let text = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      text += decoder.decode(chunk.value, { stream: true });
    }
  }
  return body.toString("latin1");
}

export const textOf = (cell: ViewCell | undefined): string =>
  cell === undefined ? "" : typeof cell === "string" ? cell : cell.text;
