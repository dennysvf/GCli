import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { billing } from "@/modules/billing";
import { scheduling } from "@/modules/scheduling";
import { services } from "@/modules/services";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  appointmentAt,
  billingWorld,
  chargeFor,
  chargeOf,
  manualCharge,
  moveTo,
  mustReceive,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterEach(() => billing.registerChargeExemptionPolicy(null));
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

describe("automatic charge on check-in", () => {
  it("F09: checking in an appointment with a price and no package creates one open charge with the price snapshot", async () => {
    const appointmentId = await appointmentAt(world);
    expect(await chargeOf(appointmentId)).toBeNull();

    await moveTo(world.desk, appointmentId, ["CHECKED_IN"]);
    const charge = await chargeFor(appointmentId);
    expect(charge).toMatchObject({
      status: "OPEN",
      origin: "APPOINTMENT",
      currency: "BRL",
      grossMinor: 25_000n,
      netMinor: 25_000n,
      paidMinor: 0n,
      patientId: world.patients.maria,
      professionalId: world.professionals.ana,
      serviceId: world.services.consulta,
      unitId: world.unitId,
    });
    expect(charge.number).toMatch(/^\d{4}-000001$/);

    // The price of the service changes later: the charge keeps the snapshot of the booking.
    const service = await services.getService(world.admin, world.services.consulta);
    expect(service.ok).toBe(true);
    const updated = await db().servicePrice.updateMany({
      where: { serviceId: world.services.consulta },
      data: { amountMinor: 99_900n },
    });
    expect(updated.count).toBeGreaterThan(0);
    expect((await chargeFor(appointmentId)).grossMinor).toBe(25_000n);
  });

  it("F09: no charge is created for a price of zero or for an appointment a package covers", async () => {
    // A courtesy appointment: its price snapshot is zero.
    const free = await appointmentAt(world, { startTime: "09:00" });
    await db().appointment.update({ where: { id: free }, data: { priceMinor: 0n } });
    await moveTo(world.desk, free, ["CHECKED_IN"]);
    expect(await chargeOf(free)).toBeNull();

    billing.registerChargeExemptionPolicy({ isExempt: async () => true });
    const covered = await appointmentAt(world, { status: ["CHECKED_IN"], startTime: "11:00" });
    expect(await chargeOf(covered)).toBeNull();
  });

  it("F09: undoing a check-in within 30 minutes removes the charge only if it has no payments", async () => {
    const plain = await appointmentAt(world, { status: ["CHECKED_IN"] });
    expect(await chargeOf(plain)).not.toBeNull();
    await moveTo(world.desk, plain, ["CONFIRMED"]);
    expect(await chargeOf(plain)).toBeNull();

    const paid = await appointmentAt(world, { status: ["CHECKED_IN"], startTime: "11:00" });
    const charge = await chargeFor(paid);
    await mustReceive(world, charge.id, 5000);
    const current = await db().appointment.findUniqueOrThrow({ where: { id: paid } });
    const undo = await scheduling.changeAppointmentStatus(world.desk, {
      appointmentId: paid,
      version: current.version,
      to: "CONFIRMED",
    });
    expect(!undo.ok && undo.error.code).toBe("BILLING_CHECK_IN_UNDO_HAS_PAYMENTS");
    const after = await db().appointment.findUniqueOrThrow({ where: { id: paid } });
    expect(after.status).toBe("CHECKED_IN");
    expect(await chargeOf(paid)).not.toBeNull();
    const audits = await db().auditEvent.findMany({ where: { entityType: "charge", action: "DELETE" } });
    expect(audits).toHaveLength(1);
  });

  it("F09: a second check-in after an undo creates a new charge", async () => {
    const appointmentId = await appointmentAt(world, { status: ["CHECKED_IN"] });
    const first = await chargeFor(appointmentId);
    await moveTo(world.desk, appointmentId, ["CONFIRMED", "CHECKED_IN"]);
    const second = await chargeFor(appointmentId);
    expect(second.id).not.toBe(first.id);
    expect(second.number).not.toBe(first.number);
    expect(await db().charge.count({ where: { appointmentId } })).toBe(1);
  });
});

describe("cross-feature: scheduling and billing", () => {
  it("F06 → F09: the check-in and the charge commit or roll back together", async () => {
    const appointmentId = await appointmentAt(world);
    billing.registerChargeExemptionPolicy({
      isExempt: async () => {
        throw new Error("exemption service unavailable");
      },
    });
    const current = await db().appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    await expect(
      scheduling.changeAppointmentStatus(world.desk, {
        appointmentId,
        version: current.version,
        to: "CHECKED_IN",
      }),
    ).rejects.toThrow("exemption service unavailable");
    const after = await db().appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(after.status).toBe(current.status);
    expect(await chargeOf(appointmentId)).toBeNull();
  });

  it("F03 → F09: manual charges use the current service price; appointment charges keep the snapshot", async () => {
    const appointmentId = await appointmentAt(world, { status: ["CHECKED_IN"] });
    await db().servicePrice.updateMany({
      where: { serviceId: world.services.consulta },
      data: { amountMinor: 30_000n },
    });
    expect((await chargeFor(appointmentId)).grossMinor).toBe(25_000n);

    const service = await services.getServiceSummaries(world.desk, [world.services.consulta]);
    const price = service.ok ? service.value[0]?.prices.find((item) => item.currency === "BRL") : undefined;
    expect(price?.amountMinor).toBe(30_000);
    const created = await billing.createManualCharge(world.desk, {
      patientId: world.patients.maria,
      unitId: world.unitId,
      serviceId: world.services.consulta,
      grossMinor: price?.amountMinor ?? 0,
    });
    expect(created.ok && created.value.grossMinor).toBe(30_000);
  });

  it("F09 → F10: package-covered appointments create no charge through the exemption policy, and package charges can be created", async () => {
    billing.registerChargeExemptionPolicy({ isExempt: async () => true });
    const appointmentId = await appointmentAt(world, { status: ["CHECKED_IN"] });
    expect(await chargeOf(appointmentId)).toBeNull();

    const packageId = "01928f9e-7a31-7c2e-9d10-4b6a1c0e2f11";
    const created = await billing.createPackageCharge(world.desk, {
      patientId: world.patients.maria,
      unitId: world.unitId,
      packageId,
      description: "Pacote 10 sessões",
      grossMinor: 150_000,
    });
    expect(created.ok && created.value).toMatchObject({ origin: "PACKAGE", status: "OPEN" });
    if (!created.ok) return;
    const status = await billing.getChargeStatus(world.desk, created.value.id);
    expect(status).toMatchObject({ ok: true, value: { status: "OPEN", paidMinor: 0, netMinor: 150_000 } });
  });

  it("F09 → F16: a unit with charges cannot change its country", async () => {
    const ptCharge = await billing.createManualCharge(world.desk, {
      patientId: world.patients.maria,
      unitId: world.ptUnitId,
      description: "Taxa de inscrição",
      grossMinor: 5000,
    });
    expect(ptCharge.ok && ptCharge.value.currency).toBe("EUR");
    const { units } = await import("@/modules/units");
    const unit = await units.getUnit(world.admin, world.ptUnitId);
    if (!unit.ok) throw new Error("getUnit failed");
    const moved = await units.updateUnit(world.admin, {
      name: unit.value.name,
      country: "ES",
      timeZone: "Europe/Madrid",
      email: null,
      unitId: world.ptUnitId,
      version: unit.value.version,
      phone: null,
      address: {},
    });
    expect(!moved.ok && moved.error.code).toBe("UNITS_COUNTRY_LOCKED");
  });
});

describe("manual charges", () => {
  it("F09: manual charges take a service or a free description in the unit's currency", async () => {
    const first = await manualCharge(world, 8990);
    const second = await manualCharge(world, 1000);
    expect(first).toMatchObject({ origin: "MANUAL", status: "OPEN", currency: "BRL", grossMinor: 8990 });
    expect(first.number.slice(5)).toBe("000001");
    expect(second.number.slice(5)).toBe("000002");
    const none = await billing.createManualCharge(world.desk, {
      patientId: world.patients.maria,
      unitId: world.unitId,
      grossMinor: 1000,
    });
    expect(!none.ok && none.error.code).toBe("VALIDATION_FAILED");
    const professional = await billing.createManualCharge(world.pro, {
      patientId: world.patients.maria,
      unitId: world.unitId,
      description: "x",
      grossMinor: 1000,
    });
    expect(!professional.ok && professional.error.code).toBe("AUTHZ_FORBIDDEN");
  });
});
