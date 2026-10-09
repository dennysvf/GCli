import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  appointmentAt,
  billingWorld,
  chargeFor,
  manualCharge,
  mustReceive,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

async function insertCharge(appointmentId: string | null, overrides: Record<string, unknown> = {}) {
  return db().charge.create({
    data: {
      id: newId(),
      organizationId: world.organizationId,
      number: `2026-${String(Math.floor(Math.random() * 900_000) + 100_000)}`,
      patientId: world.patients.maria,
      origin: appointmentId ? "APPOINTMENT" : "MANUAL",
      appointmentId,
      description: appointmentId ? null : "Taxa",
      serviceId: appointmentId ? world.services.consulta : null,
      unitId: world.unitId,
      currency: "BRL",
      grossMinor: 10_000n,
      netMinor: 10_000n,
      status: "OPEN",
      createdById: world.desk.user.id,
      ...overrides,
    },
  });
}

describe("billing schema", () => {
  it("F09: the database refuses paid above net and two live charges for one appointment", async () => {
    const appointmentId = await appointmentAt(world);
    const first = await insertCharge(appointmentId);
    await expect(
      db().charge.update({ where: { id: first.id }, data: { paidMinor: 10_001n } }),
    ).rejects.toThrow(/ck_charge_amounts/);
    await expect(
      db().charge.update({ where: { id: first.id }, data: { discountMinor: 500n } }),
    ).rejects.toThrow(/ck_charge_amounts/);
    await expect(insertCharge(appointmentId)).rejects.toThrow(/uq_charge_live_appointment/);

    // A voided charge does not count as live.
    await db().charge.update({
      where: { id: first.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: "Erro",
        cancelledById: world.manager.user.id,
      },
    });
    await expect(insertCharge(appointmentId)).resolves.toMatchObject({ status: "OPEN" });
    await expect(insertCharge(null, { number: first.number })).rejects.toThrow(/uq_charge_number/);
  });

  it("F09: a charge with payments cannot be deleted and payments cannot be deleted", async () => {
    const charge = await manualCharge(world, 20_000);
    await mustReceive(world, charge.id, 5000);
    await expect(db().charge.delete({ where: { id: charge.id } })).rejects.toThrow(
      /fk_payment_charge_currency|foreign key/i,
    );
    const payment = await db().payment.findFirstOrThrow({ where: { chargeId: charge.id } });
    await expect(db().payment.delete({ where: { id: payment.id } })).rejects.toThrow(/permission denied/i);
    await expect(db().paymentSubmission.deleteMany({})).rejects.toThrow(/permission denied/i);
    // Without payments a charge can be deleted (the check-in undo).
    const bare = await manualCharge(world, 1000);
    await expect(db().charge.delete({ where: { id: bare.id } })).resolves.toBeTruthy();
  });

  it("F09: a payment always has the currency of its charge and a valid shape", async () => {
    const charge = await manualCharge(world, 20_000);
    const paid = await mustReceive(world, charge.id, 5000);
    const base = await db().payment.findUniqueOrThrow({ where: { id: paid.payments[0]?.id } });
    const clone = {
      organizationId: base.organizationId,
      chargeId: base.chargeId,
      kind: "PAYMENT",
      submissionId: base.submissionId,
      method: "PIX",
      amountMinor: 100n,
      currency: "BRL",
      unitId: base.unitId,
      receivedAt: new Date(),
      userId: base.userId,
    };
    await expect(db().payment.create({ data: { id: newId(), ...clone, currency: "EUR" } })).rejects.toThrow(
      /fk_payment_charge_currency/,
    );
    await expect(
      db().payment.create({ data: { id: newId(), ...clone, amountMinor: -100n } }),
    ).rejects.toThrow(/ck_payment_kind/);
    await expect(db().payment.create({ data: { id: newId(), ...clone, installments: 2 } })).rejects.toThrow(
      /ck_payment_installments/,
    );
    await expect(
      db().payment.create({ data: { id: newId(), ...clone, method: "CREDIT_CARD", installments: 13 } }),
    ).rejects.toThrow(/ck_payment_installments/);
  });

  it("F09 → F12/F13/F14: charge and payment records expose patient, origin, service, professional, unit, amounts, status, method, date and user", async () => {
    const appointmentId = await appointmentAt(world, { status: ["CHECKED_IN"] });
    const charge = await chargeFor(appointmentId);
    await mustReceive(world, charge.id, 25_000, "DEBIT_CARD");
    const row = await db().charge.findUniqueOrThrow({
      where: { id: charge.id },
      include: { payments: true },
    });
    expect(row).toMatchObject({
      patientId: world.patients.maria,
      origin: "APPOINTMENT",
      appointmentId,
      serviceId: world.services.consulta,
      professionalId: world.professionals.ana,
      unitId: world.unitId,
      grossMinor: 25_000n,
      discountMinor: 0n,
      netMinor: 25_000n,
      status: "PAID",
    });
    expect(row.payments[0]).toMatchObject({
      method: "DEBIT_CARD",
      amountMinor: 25_000n,
      unitId: world.unitId,
      userId: world.desk.user.id,
    });
    expect(row.payments[0]?.receivedAt).toBeInstanceOf(Date);
  });
});
