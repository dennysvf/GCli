import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { billing } from "@/modules/billing";
import { packages } from "@/modules/packages";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import {
  billingWorld,
  linkOf,
  moveTo,
  mustBookLinked,
  packageRow,
  soldPackage,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

const DAY = 86_400_000;

describe("package expiration", () => {
  it("F10: at expiration the package becomes expired, remaining sessions are forfeited, and future linked appointments are unlinked and flagged", async () => {
    const sold = await soldPackage(world, { validityDays: 30, name: "Trinta" });
    const done = await mustBookLinked(world, sold.package.id, { startTime: "09:00" });
    await moveTo(world.desk, done, ["CHECKED_IN"]);
    await moveTo(world.pro, done, ["IN_PROGRESS", "COMPLETED"]);
    const future = await mustBookLinked(world, sold.package.id, { startTime: "10:00" });

    const early = await packages.expirePackages({
      organizationId: world.organizationId,
      timeZone: "America/Sao_Paulo",
      now: new Date(Date.now() + 10 * DAY),
    });
    expect(early.ok && early.value.expired).toBe(0);

    const late = await packages.expirePackages({
      organizationId: world.organizationId,
      timeZone: "America/Sao_Paulo",
      now: new Date(Date.now() + 40 * DAY),
    });
    expect(late.ok && late.value.expired).toBe(1);
    expect(await packageRow(sold.package.id)).toMatchObject({
      status: "EXPIRED",
      usedSessions: 1,
      forfeitedSessions: 9,
    });
    expect(await linkOf(future)).toMatchObject({ status: "UNLINKED_EXPIRED", flagged: true });
    expect(await linkOf(done)).toMatchObject({ status: "DEBITED" });
    const movement = await db().packageMovement.findFirstOrThrow({ where: { kind: "FORFEIT" } });
    expect(movement.sessions).toBe(9);

    // The flag shows on the agenda until the patient arrives, and then the visit is charged.
    const detail = await (await import("@/modules/scheduling")).scheduling.getAppointment(world.desk, future);
    expect(detail.ok && detail.value.package).toMatchObject({ flagged: true });
    await moveTo(world.desk, future, ["CONFIRMED", "CHECKED_IN"]);
    expect(await db().charge.count({ where: { appointmentId: future } })).toBe(1);
    expect(await linkOf(future)).toMatchObject({ flagged: false });
  });

  it("F10: the expiration job runs once per organization and day", async () => {
    const sold = await soldPackage(world, { validityDays: 30, name: "Trinta" });
    const now = new Date(Date.now() + 40 * DAY);
    const input = { organizationId: world.organizationId, timeZone: "America/Sao_Paulo", now };
    const first = await packages.expirePackages(input);
    expect(first.ok && first.value.expired).toBe(1);
    expect(await db().packageExpirationRun.count()).toBe(1);
    // A package sold after the first run of the day waits for the next day.
    const another = await soldPackage(world, { validityDays: 30, name: "Outro" });
    await db().patientPackage.update({
      where: { id: another.package.id },
      data: { soldOn: new Date("2026-01-01T00:00:00Z"), expiresOn: new Date("2026-01-30T00:00:00Z") },
    });
    const second = await packages.expirePackages(input);
    expect(second.ok && second.value.expired).toBe(0);
    expect(sold.package.id).toBeTruthy();
  });
});

describe("extending and cancelling", () => {
  it("F10: a manager can extend validity by up to 365 days with a reason; front desk cannot", async () => {
    const sold = await soldPackage(world, { validityDays: 30, name: "Trinta" });
    const input = { packageId: sold.package.id, days: 60, reason: "Paciente afastado por cirurgia" };
    const desk = await packages.extendPackage(world.desk, input);
    expect(!desk.ok && desk.error.code).toBe("AUTHZ_FORBIDDEN");
    expect(await db().auditEvent.count({ where: { action: "PERMISSION_DENIED" } })).toBeGreaterThanOrEqual(1);
    const noReason = await packages.extendPackage(world.manager, { ...input, reason: "" });
    expect(!noReason.ok && noReason.error.code).toBe("PACKAGE_REASON_REQUIRED");

    const before = (await packageRow(sold.package.id)).expiresOn.toISOString().slice(0, 10);
    const extended = await packages.extendPackage(world.manager, input);
    expect(extended.ok && extended.value.expiresOn).not.toBe(before);
    expect(await packageRow(sold.package.id)).toMatchObject({ extendedDays: 60 });
    const over = await packages.extendPackage(world.manager, { ...input, days: 306 });
    expect(!over.ok && over.error.code).toBe("PACKAGE_EXTENSION_LIMIT");
    expect(!over.ok && over.error.params).toEqual({ days: 305 });
    expect((await packages.extendPackage(world.manager, { ...input, days: 305 })).ok).toBe(true);
    expect(await db().packageMovement.count({ where: { kind: "EXTEND" } })).toBe(2);
  });

  it("F10: cancelling a package with links needs confirmation, unlinks them and voids an unpaid charge", async () => {
    const sold = await soldPackage(world);
    const appointmentId = await mustBookLinked(world, sold.package.id);
    const input = { packageId: sold.package.id, reason: "Paciente mudou de cidade" };

    const deskTry = await packages.cancelPackage(world.desk, input);
    expect(!deskTry.ok && deskTry.error.code).toBe("AUTHZ_FORBIDDEN");
    const asked = await packages.cancelPackage(world.manager, input);
    expect(!asked.ok && asked.error).toMatchObject({
      code: "PACKAGE_HAS_LINKED_APPOINTMENTS",
      params: { count: 1 },
    });
    expect(await packageRow(sold.package.id)).toMatchObject({ status: "ACTIVE" });

    const done = await packages.cancelPackage(world.manager, { ...input, confirmUnlink: true });
    expect(done.ok && done.value).toMatchObject({ chargeVoided: true, package: { status: "CANCELLED" } });
    expect(await packageRow(sold.package.id)).toMatchObject({ status: "CANCELLED", forfeitedSessions: 10 });
    expect(await linkOf(appointmentId)).toMatchObject({ status: "UNLINKED_CANCELLED", flagged: true });
    const charge = await db().charge.findUniqueOrThrow({ where: { id: sold.charge.id } });
    expect(charge.status).toBe("CANCELLED");
    const again = await packages.cancelPackage(world.manager, { ...input, confirmUnlink: true });
    expect(!again.ok && again.error.code).toBe("PACKAGE_NOT_ACTIVE");
  });

  it("F10: cancelling a package with a paid charge keeps the charge for the refund flow", async () => {
    const sold = await soldPackage(world);
    const paid = await billing.receivePayment(world.desk, {
      chargeId: sold.charge.id,
      submissionKey: crypto.randomUUID(),
      unitId: world.unitId,
      payments: [{ method: "PIX", amountMinor: 50_000 }],
    });
    expect(paid.ok).toBe(true);
    const done = await packages.cancelPackage(world.manager, {
      packageId: sold.package.id,
      reason: "Cancelamento a pedido",
    });
    expect(done.ok && done.value).toMatchObject({ chargeVoided: false, chargeId: sold.charge.id });
    const charge = await db().charge.findUniqueOrThrow({ where: { id: sold.charge.id } });
    expect(charge.status).toBe("PARTIALLY_PAID");
  });
});
