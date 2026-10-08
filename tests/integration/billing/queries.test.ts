import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { billing } from "@/modules/billing";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import { schedulingWorld } from "../scheduling/support";
import {
  appointmentAt,
  billingWorld,
  chargeFor,
  manualCharge,
  mustReceive,
  receive,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

describe("charge reads", () => {
  it("F09: the charges list filters by period, unit, status, professional and method, with totals per currency", async () => {
    const appointmentId = await appointmentAt(world, { status: ["CHECKED_IN"] });
    const appointmentCharge = await chargeFor(appointmentId);
    await mustReceive(world, appointmentCharge.id, 25_000, "PIX");
    const partial = await manualCharge(world, 10_000);
    await mustReceive(world, partial.id, 4000, "CASH");
    await manualCharge(world, 5000);
    const euro = await billing.createManualCharge(world.desk, {
      patientId: world.patients.maria,
      unitId: world.ptUnitId,
      description: "Taxa",
      grossMinor: 3000,
    });
    if (!euro.ok) throw new Error(euro.error.code);

    const all = await billing.listCharges(world.desk, {});
    expect(all.ok && all.value.items).toHaveLength(4);
    expect(all.ok && all.value.totals).toEqual([
      {
        currency: "BRL",
        grossMinor: 40_000,
        discountMinor: 0,
        netMinor: 40_000,
        paidMinor: 29_000,
        balanceMinor: 11_000,
      },
      {
        currency: "EUR",
        grossMinor: 3000,
        discountMinor: 0,
        netMinor: 3000,
        paidMinor: 0,
        balanceMinor: 3000,
      },
    ]);

    const byStatus = await billing.listCharges(world.desk, { statuses: ["PAID"] });
    expect(byStatus.ok && byStatus.value.items.map((item) => item.id)).toEqual([appointmentCharge.id]);
    const byUnit = await billing.listCharges(world.desk, { unitId: world.ptUnitId });
    expect(byUnit.ok && byUnit.value.items.map((item) => item.id)).toEqual([euro.value.id]);
    const byProfessional = await billing.listCharges(world.desk, { professionalId: world.professionals.ana });
    expect(byProfessional.ok && byProfessional.value.items.map((item) => item.id)).toEqual([
      appointmentCharge.id,
    ]);
    const byMethod = await billing.listCharges(world.desk, { method: "CASH" });
    expect(byMethod.ok && byMethod.value.items.map((item) => item.id)).toEqual([partial.id]);

    const lastYear = await billing.listCharges(world.desk, { from: "2020-01-01", to: "2020-01-31" });
    expect(lastYear.ok && lastYear.value.items).toEqual([]);
    const tooLong = await billing.listCharges(world.desk, { from: "2020-01-01", to: "2022-01-31" });
    expect(!tooLong.ok && tooLong.error.code).toBe("VALIDATION_FAILED");
  });

  it("F09: the list pages with a cursor", async () => {
    for (let index = 0; index < 52; index++) {
      await db().charge.create({
        data: {
          id: crypto.randomUUID(),
          organizationId: world.organizationId,
          number: `2026-9${String(index).padStart(5, "0")}`,
          patientId: world.patients.maria,
          origin: "MANUAL",
          description: "Taxa",
          unitId: world.unitId,
          currency: "BRL",
          grossMinor: 1000n,
          netMinor: 1000n,
          status: "OPEN",
          createdById: world.desk.user.id,
        },
      });
    }
    const first = await billing.listCharges(world.desk, {});
    expect(first.ok && first.value.items).toHaveLength(50);
    const cursor = first.ok ? first.value.nextCursor : null;
    expect(cursor).not.toBeNull();
    const second = await billing.listCharges(world.desk, { cursor });
    expect(second.ok && second.value.items).toHaveLength(2);
    expect(second.ok && second.value.nextCursor).toBeNull();
    expect(first.ok && second.ok && first.value.totals[0]?.grossMinor).toBe(52_000);
  });

  it("F09: the patient tab shows open charges first with the total due", async () => {
    const paid = await manualCharge(world, 3000);
    await mustReceive(world, paid.id, 3000);
    const partial = await manualCharge(world, 10_000);
    await mustReceive(world, partial.id, 2000);
    const open = await manualCharge(world, 5000);
    const result = await billing.listPatientCharges(world.desk, world.patients.maria);
    expect(result.ok && result.value.open.map((item) => item.id)).toEqual([open.id, partial.id]);
    expect(result.ok && result.value.dueByCurrency).toEqual([{ currency: "BRL", balanceMinor: 13_000 }]);
    expect(result.ok && result.value.history).toHaveLength(3);
    expect(result.ok && result.value.history.find((item) => item.id === partial.id)?.payments).toHaveLength(
      1,
    );
  });

  it("F09: the receive options bring units, enabled methods, approvers and the user's powers", async () => {
    const charge = await manualCharge(world, 10_000);
    const options = await billing.getReceiveOptions(world.desk, { chargeId: charge.id });
    expect(options.ok && options.value).toMatchObject({
      selectedUnitId: world.unitId,
      canApprove: false,
      approvers: [{ id: world.manager.user.id }],
    });
    expect(options.ok && options.value.methodsByCountry.BR).toContain("PIX");
    expect(options.ok && options.value.methodsByCountry.PT).toContain("MBWAY");
    expect(options.ok && options.value.units.map((unit) => unit.id).sort()).toEqual(
      [world.unitId, world.ptUnitId].sort(),
    );
    const manager = await billing.getReceiveOptions(world.manager, { chargeId: charge.id });
    expect(manager.ok && manager.value.canApprove).toBe(true);
  });

  it("F09: the appointment charge is found for the agenda panel", async () => {
    const appointmentId = await appointmentAt(world, { status: ["CHECKED_IN"] });
    const found = await billing.getAppointmentCharge(world.desk, appointmentId);
    expect(found.ok && found.value).toMatchObject({
      status: "OPEN",
      grossMinor: 25_000,
      patientName: "Mari Oliveira",
    });
    const none = await billing.getAppointmentCharge(
      world.desk,
      await appointmentAt(world, { startTime: "14:00" }),
    );
    expect(none.ok && none.value).toBeNull();
  });

  it("F09: professionals cannot read billing", async () => {
    const charge = await manualCharge(world, 10_000);
    const list = await billing.listCharges(world.pro, {});
    expect(!list.ok && list.error.code).toBe("AUTHZ_FORBIDDEN");
    const one = await billing.getCharge(world.pro, { chargeId: charge.id });
    expect(!one.ok && one.error.code).toBe("AUTHZ_FORBIDDEN");
    const patient = await billing.listPatientCharges(world.pro, world.patients.maria);
    expect(!patient.ok && patient.error.code).toBe("AUTHZ_FORBIDDEN");
    const denials = await db().auditEvent.count({
      where: { action: "PERMISSION_DENIED", actorUserId: world.pro.user.id },
    });
    expect(denials).toBe(3);
  });

  it("F09: billing records are isolated per organization", async () => {
    const charge = await manualCharge(world, 10_000);
    const other = await schedulingWorld();
    const list = await billing.listCharges(other.desk, {});
    expect(list.ok && list.value.items).toEqual([]);
    const found = await billing.getCharge(other.desk, { chargeId: charge.id });
    expect(!found.ok && found.error.code).toBe("BILLING_CHARGE_NOT_FOUND");
    const paid = await receive(world, charge.id, [{ method: "PIX", amountMinor: 1000 }], {}, other.desk);
    expect(!paid.ok).toBe(true);
    const voided = await billing.voidCharge(other.manager, { chargeId: charge.id, reason: "Tentativa" });
    expect(!voided.ok && voided.error.code).toBe("BILLING_CHARGE_NOT_FOUND");
  });
});
