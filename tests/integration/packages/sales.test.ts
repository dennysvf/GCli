import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { billing } from "@/modules/billing";
import { createPackages, packages } from "@/modules/packages";
import { db } from "@/shared/db/client";
import { domainError } from "@/shared/kernel/errors";
import { fail } from "@/shared/kernel/result";
import { closeHelpers, resetDatabase } from "../helpers";
import { schedulingWorld } from "../scheduling/support";
import { billingWorld, sellFor, soldPackage, templateFor, type BillingWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

describe("selling a package", () => {
  it("F10: selling a package creates exactly one charge with origin package; if the charge fails, no package is saved", async () => {
    const templateId = await templateFor(world);
    const sale = await sellFor(world, templateId);
    expect(sale.ok && sale.value.package).toMatchObject({
      status: "ACTIVE",
      totalSessions: 10,
      usedSessions: 0,
      freeSessions: 10,
      priceMinor: 150_000,
      chargeStatus: "OPEN",
    });
    expect(await db().charge.count({ where: { origin: "PACKAGE" } })).toBe(1);
    const charge = await db().charge.findFirstOrThrow({ where: { origin: "PACKAGE" } });
    expect(charge).toMatchObject({
      grossMinor: 150_000n,
      netMinor: 150_000n,
      status: "OPEN",
      currency: "BRL",
    });
    expect(charge.packageId).toBe(sale.ok ? sale.value.package.id : null);
    expect(await db().packageMovement.count({ where: { kind: "SALE" } })).toBe(1);

    const failing = createPackages((deps) => ({
      ...deps,
      billing: {
        ...deps.billing,
        createCharge: async () => fail(domainError("BILLING_CHARGE_NOT_FOUND", 404)),
      },
    }));
    const failed = await failing.sellPackage(world.desk, {
      patientId: world.patients.maria,
      templateId,
      unitId: world.unitId,
      priceMinor: 150_000,
    });
    expect(!failed.ok && failed.error.code).toBe("PACKAGE_SALE_FAILED");
    expect(await db().patientPackage.count()).toBe(1);
    expect(await db().charge.count({ where: { origin: "PACKAGE" } })).toBe(1);
  });

  it("F10: a lower price becomes a discount on the package charge with the F09 thresholds", async () => {
    const templateId = await templateFor(world);
    const small = await sellFor(world, templateId, { priceMinor: 135_000 });
    expect(small.ok).toBe(true);
    const noReason = await sellFor(world, templateId, { priceMinor: 120_000 });
    expect(!noReason.ok && noReason.error.code).toBe("BILLING_DISCOUNT_REASON_REQUIRED");
    const withReason = await sellFor(world, templateId, {
      priceMinor: 120_000,
      discountReason: "Fechamento de pacote",
    });
    expect(withReason.ok && withReason.value.charge).toMatchObject({ status: "OPEN", netMinor: 120_000 });

    // Above 20% the desk needs a manager: nothing is saved without it.
    const before = await db().patientPackage.count();
    const needsApproval = await sellFor(world, templateId, {
      priceMinor: 100_000,
      discountReason: "Parceria",
    });
    expect(!needsApproval.ok && needsApproval.error.code).toBe("BILLING_DISCOUNT_NEEDS_APPROVAL");
    expect(await db().patientPackage.count()).toBe(before);

    const waiting = await sellFor(world, templateId, {
      priceMinor: 100_000,
      discountReason: "Parceria",
      submitForApproval: true,
    });
    expect(waiting.ok && waiting.value.charge.status).toBe("PENDING_APPROVAL");
    const manager = await sellFor(
      world,
      templateId,
      { priceMinor: 100_000, discountReason: "Parceria" },
      world.manager,
    );
    expect(manager.ok && manager.value.charge).toMatchObject({ status: "OPEN", netMinor: 100_000 });
    const discounts = await db().charge.findMany({
      where: { origin: "PACKAGE" },
      orderBy: { createdAt: "asc" },
    });
    expect(discounts.map((charge) => Number(charge.discountMinor))).toEqual([15_000, 30_000, 0, 50_000]);
  });

  it("F10: a price above the template and a currency without price are refused", async () => {
    const templateId = await templateFor(world);
    const above = await sellFor(world, templateId, { priceMinor: 150_001 });
    expect(!above.ok && above.error.code).toBe("PACKAGE_PRICE_ABOVE_TEMPLATE");
    const euros = await sellFor(world, templateId, { unitId: world.ptUnitId });
    expect(!euros.ok && euros.error.code).toBe("PACKAGE_NO_PRICE_FOR_CURRENCY");
    expect(await db().patientPackage.count()).toBe(0);
  });

  it("F09 → F10: selling a package creates a charge in F09, and the package card shows the payment status from F09", async () => {
    const sold = await soldPackage(world);
    const unpaid = await packages.listPatientPackages(world.desk, { patientId: world.patients.maria });
    expect(unpaid.ok && unpaid.value).toMatchObject({ hasOpenBalance: true });
    expect(unpaid.ok && unpaid.value.packages[0]).toMatchObject({
      id: sold.package.id,
      chargeStatus: "OPEN",
    });

    const paid = await billing.receivePayment(world.desk, {
      chargeId: sold.charge.id,
      submissionKey: crypto.randomUUID(),
      unitId: world.unitId,
      payments: [{ method: "PIX", amountMinor: 150_000 }],
    });
    expect(paid.ok).toBe(true);
    const settled = await packages.listPatientPackages(world.desk, { patientId: world.patients.maria });
    expect(settled.ok && settled.value.hasOpenBalance).toBe(false);
    expect(settled.ok && settled.value.packages[0]?.chargeStatus).toBe("PAID");
  });

  it("F05 → F10: the patient's social name appears in package sales", async () => {
    let seen: string | undefined;
    const spy = createPackages((deps) => ({
      ...deps,
      directory: {
        ...deps.directory,
        patient: async (ctx, patientId) => {
          const found = await deps.directory.patient(ctx, patientId);
          if (found.ok) seen = found.value.displayName;
          return found;
        },
      },
    }));
    const templateId = await templateFor(world);
    const sale = await spy.sellPackage(world.desk, {
      patientId: world.patients.maria,
      templateId,
      unitId: world.unitId,
      priceMinor: 150_000,
    });
    expect(sale.ok).toBe(true);
    expect(seen).toBe("Mari Oliveira");
  });

  it("F10: professionals cannot sell or read packages and packages are isolated per organization", async () => {
    const templateId = await templateFor(world);
    const forbidden = await sellFor(world, templateId, {}, world.pro);
    expect(!forbidden.ok && forbidden.error.code).toBe("AUTHZ_FORBIDDEN");
    const read = await packages.listPatientPackages(world.pro, { patientId: world.patients.maria });
    expect(!read.ok && read.error.code).toBe("AUTHZ_FORBIDDEN");

    const sold = await soldPackage(world, { name: "Segundo pacote" });
    const other = await schedulingWorld();
    const list = await packages.listPatientPackages(other.desk, { patientId: other.patients.maria });
    expect(list.ok && list.value.packages).toEqual([]);
    const extended = await packages.extendPackage(other.manager, {
      packageId: sold.package.id,
      days: 10,
      reason: "Tentativa de outra clínica",
    });
    expect(!extended.ok && extended.error.code).toBe("PACKAGE_NOT_FOUND");
    expect(await db().auditEvent.count({ where: { action: "PERMISSION_DENIED" } })).toBeGreaterThanOrEqual(2);
  });
});
