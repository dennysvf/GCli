import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { closeHelpers, resetDatabase } from "../helpers";
import { billingWorld, mustBookLinked, packageRow, soldPackage, type BillingWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

describe("packages schema", () => {
  it("F10: the database refuses debits beyond the total and two live links for one appointment", async () => {
    const sold = await soldPackage(world, { sessions: 2, name: "Dois" });
    await expect(
      db().patientPackage.update({ where: { id: sold.package.id }, data: { usedSessions: 3 } }),
    ).rejects.toThrow(/ck_patient_package_sessions/);
    await expect(
      db().patientPackage.update({
        where: { id: sold.package.id },
        data: { usedSessions: 1, forfeitedSessions: 2 },
      }),
    ).rejects.toThrow(/ck_patient_package_sessions/);
    expect((await packageRow(sold.package.id)).usedSessions).toBe(0);

    const appointmentId = await mustBookLinked(world, sold.package.id);
    await expect(
      db().packageAppointment.create({
        data: {
          id: newId(),
          organizationId: world.organizationId,
          packageId: sold.package.id,
          appointmentId,
          status: "LINKED",
        },
      }),
    ).rejects.toThrow(/uq_package_appointment_live/);
  });

  it("F10: the validity, the extension and the status stay coherent", async () => {
    const sold = await soldPackage(world);
    await expect(
      db().patientPackage.update({ where: { id: sold.package.id }, data: { extendedDays: 366 } }),
    ).rejects.toThrow(/ck_patient_package_(extension|expiry)/);
    await expect(
      db().patientPackage.update({
        where: { id: sold.package.id },
        data: { expiresOn: new Date("2030-01-01T00:00:00Z") },
      }),
    ).rejects.toThrow(/ck_patient_package_expiry/);
    await expect(
      db().patientPackage.update({ where: { id: sold.package.id }, data: { status: "EXPIRED" } }),
    ).rejects.toThrow(/ck_patient_package_status/);
  });

  it("F10: the ledger is append-only and packages are never deleted", async () => {
    const sold = await soldPackage(world);
    const movement = await db().packageMovement.findFirstOrThrow({ where: { packageId: sold.package.id } });
    await expect(
      db().packageMovement.update({ where: { id: movement.id }, data: { sessions: 1 } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(db().packageMovement.delete({ where: { id: movement.id } })).rejects.toThrow(
      /permission denied/i,
    );
    await expect(db().patientPackage.delete({ where: { id: sold.package.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("F10: package records expose patient, service, sessions, dates, status, charge and links to F13 and F14", async () => {
    const sold = await soldPackage(world);
    const appointmentId = await mustBookLinked(world, sold.package.id);
    const row = await db().patientPackage.findUniqueOrThrow({
      where: { id: sold.package.id },
      include: { links: true, movements: true },
    });
    expect(row).toMatchObject({
      patientId: world.patients.maria,
      serviceId: world.services.consulta,
      totalSessions: 10,
      status: "ACTIVE",
      chargeId: sold.charge.id,
      currency: "BRL",
    });
    expect(row.links.map((link) => link.appointmentId)).toEqual([appointmentId]);
    expect(row.movements.map((movement) => movement.kind)).toEqual(["SALE"]);
  });
});
