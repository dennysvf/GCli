import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { packages } from "@/modules/packages";
import { scheduling } from "@/modules/scheduling";
import { db } from "@/shared/db/client";
import { errorMessage } from "@/shared/kernel/action-result";
import { createTranslator } from "@/shared/i18n/translator";
import { closeHelpers, resetDatabase } from "../helpers";
import { firstReasonId } from "../scheduling/support";
import {
  billingWorld,
  bookLinked,
  day,
  linkOf,
  moveTo,
  mustBookLinked,
  packageRow,
  seriesOf,
  soldPackage,
  type BillingWorld,
} from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: BillingWorld;
beforeEach(async () => {
  world = await billingWorld();
});

const pt = createTranslator("pt-BR");

// A no-show is only allowed after the start time, so the booked appointment is moved into the past.
async function startedAgo(appointmentId: string) {
  const startsAt = new Date(Date.now() - 2 * 3_600_000);
  await db().appointment.update({
    where: { id: appointmentId },
    data: { startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60_000) },
  });
}

describe("linking appointments to a package", () => {
  it("F10: booking for a patient with an active package of the same service offers linking, and a linked appointment does not generate a charge on check-in", async () => {
    const sold = await soldPackage(world);
    const offered = await packages.eligiblePackages(world.desk, {
      patientId: world.patients.maria,
      serviceId: world.services.consulta,
      date: day(1),
    });
    expect(offered.ok && offered.value).toMatchObject([
      { id: sold.package.id, freeSessions: 10, totalSessions: 10 },
    ]);
    const other = await packages.eligiblePackages(world.desk, {
      patientId: world.patients.maria,
      serviceId: world.services.retorno,
      date: day(1),
    });
    expect(other.ok && other.value).toEqual([]);

    const appointmentId = await mustBookLinked(world, sold.package.id);
    expect(await linkOf(appointmentId)).toMatchObject({ status: "LINKED", packageId: sold.package.id });
    await moveTo(world.desk, appointmentId, ["CHECKED_IN"]);
    expect(await db().charge.count({ where: { appointmentId } })).toBe(0);
    // The agenda shows the session of the package.
    const detail = await scheduling.getAppointment(world.desk, appointmentId);
    expect(detail.ok && detail.value.package).toMatchObject({
      packageId: sold.package.id,
      session: 1,
      total: 10,
    });
  });

  it("F10: completing a linked appointment debits one session; reverting restores it; cancelling does not debit", async () => {
    const sold = await soldPackage(world);
    const appointmentId = await mustBookLinked(world, sold.package.id);
    await moveTo(world.desk, appointmentId, ["CHECKED_IN"]);
    await moveTo(world.pro, appointmentId, ["IN_PROGRESS", "COMPLETED"]);
    expect(await packageRow(sold.package.id)).toMatchObject({ usedSessions: 1 });
    expect(await linkOf(appointmentId)).toMatchObject({ status: "DEBITED" });

    await moveTo(world.pro, appointmentId, ["IN_PROGRESS"]);
    expect(await packageRow(sold.package.id)).toMatchObject({ usedSessions: 0 });
    expect(await linkOf(appointmentId)).toMatchObject({ status: "LINKED", debitedAt: null });
    const kinds = (await db().packageMovement.findMany({ orderBy: { occurredAt: "asc" } })).map(
      (m) => m.kind,
    );
    expect(kinds).toEqual(["SALE", "DEBIT", "RESTORE"]);

    const second = await mustBookLinked(world, sold.package.id, { startTime: "11:00" });
    const cancelled = await scheduling.cancelAppointment(world.desk, {
      appointmentId: second,
      version: 1,
      origin: "PATIENT",
      reasonId: await firstReasonId(world.desk),
      note: "Viagem",
    });
    expect(cancelled.ok).toBe(true);
    expect(await linkOf(second)).toMatchObject({ status: "RELEASED" });
    expect(await packageRow(sold.package.id)).toMatchObject({ usedSessions: 0 });
  });

  it("F10: a no-show debits a session only when the organization setting is enabled", async () => {
    const sold = await soldPackage(world);
    const first = await mustBookLinked(world, sold.package.id);
    await startedAgo(first);
    await moveTo(world.desk, first, ["NO_SHOW"]);
    expect(await linkOf(first)).toMatchObject({ status: "RELEASED" });
    expect(await packageRow(sold.package.id)).toMatchObject({ usedSessions: 0 });

    await packages.setNoShowDebit(world.manager, { enabled: true });
    const second = await mustBookLinked(world, sold.package.id, { startTime: "11:00" });
    await startedAgo(second);
    await moveTo(world.desk, second, ["NO_SHOW"]);
    expect(await linkOf(second)).toMatchObject({ status: "DEBITED" });
    expect(await packageRow(sold.package.id)).toMatchObject({ usedSessions: 1 });
  });

  it("F10: linking is blocked when future linked appointments already equal the remaining balance", async () => {
    const sold = await soldPackage(world, { sessions: 2, name: "Dois" }, { priceMinor: 150_000 });
    await mustBookLinked(world, sold.package.id, { startTime: "09:00" });
    await mustBookLinked(world, sold.package.id, { startTime: "10:00" });
    const third = await bookLinked(world, sold.package.id, { startTime: "11:00" });
    expect(!third.ok && third.error.code).toBe("PACKAGE_BALANCE_EXHAUSTED");
    expect(!third.ok && errorMessage(pt, "packages", third.error.code, third.error.params)).toBe(
      "Este pacote possui 2 sessões restantes e 2 agendamentos futuros já vinculados.",
    );
    // The appointment was not created.
    expect(await db().appointment.count({ where: { patientId: world.patients.maria } })).toBe(2);
    const offered = await packages.eligiblePackages(world.desk, {
      patientId: world.patients.maria,
      serviceId: world.services.consulta,
      date: day(1),
    });
    expect(offered.ok && offered.value).toEqual([]);
  });

  it("F10: two concurrent bookings on the last free session link only one", async () => {
    const sold = await soldPackage(world, { sessions: 2, name: "Dois" });
    await mustBookLinked(world, sold.package.id, { startTime: "09:00" });
    const results = await Promise.all([
      bookLinked(world, sold.package.id, { startTime: "10:00" }),
      bookLinked(world, sold.package.id, { startTime: "11:00" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const failed = results.find((result) => !result.ok);
    expect(!failed?.ok && failed?.error.code).toBe("PACKAGE_BALANCE_EXHAUSTED");
    expect(await db().packageAppointment.count({ where: { status: "LINKED" } })).toBe(2);
  });

  it("F10: a series links occurrences up to the free balance and charges the rest", async () => {
    const sold = await soldPackage(world, { sessions: 4, name: "Quatro" });
    const coverage = await packages.seriesCoverage(world.desk, { packageId: sold.package.id, count: 6 });
    expect(coverage.ok && coverage.value).toEqual({ covered: 4, rest: 2 });
    const saved = await scheduling.bookSeries(world.desk, seriesOf(world, sold.package.id, 6));
    if (!saved.ok) throw new Error(saved.error.code);
    expect(saved.value.appointmentIds).toHaveLength(6);
    expect(await db().packageAppointment.count({ where: { status: "LINKED" } })).toBe(4);
    const linked = await db().packageAppointment.findMany({ select: { appointmentId: true } });
    const unlinked = saved.value.appointmentIds.filter(
      (id) => !linked.some((item) => item.appointmentId === id),
    );
    expect(unlinked).toHaveLength(2);
    await moveTo(world.desk, unlinked[0] ?? "", ["CONFIRMED", "CHECKED_IN"]);
    expect(await db().charge.count({ where: { appointmentId: unlinked[0] } })).toBe(1);
  });

  it("F10: rescheduling past the expiry is refused and editing to another service releases the link", async () => {
    const sold = await soldPackage(world, { validityDays: 30, name: "Trinta" });
    const appointmentId = await mustBookLinked(world, sold.package.id);
    const late = await scheduling.rescheduleAppointment(world.desk, {
      appointmentId,
      version: 1,
      date: day(45),
      startTime: "10:00",
      professionalId: world.professionals.ana,
      roomId: world.rooms.sala1,
      source: "FORM",
    });
    expect(!late.ok && late.error.code).toBe("PACKAGE_EXPIRES_BEFORE");
    expect(await linkOf(appointmentId)).toMatchObject({ status: "LINKED" });

    const edited = await scheduling.updateAppointment(world.desk, {
      appointmentId,
      version: 1,
      serviceId: world.services.retorno,
      roomId: null,
    });
    expect(edited.ok).toBe(true);
    expect(await linkOf(appointmentId)).toMatchObject({ status: "RELEASED" });
  });

  it("F10: an edit can link and unlink a package, and a wrong patient or service is refused", async () => {
    const sold = await soldPackage(world);
    const plain = await mustBookLinked(world, null);
    const linked = await scheduling.updateAppointment(world.desk, {
      appointmentId: plain,
      version: 1,
      packageId: sold.package.id,
    });
    expect(linked.ok).toBe(true);
    expect(await linkOf(plain)).toMatchObject({ status: "LINKED" });
    const removed = await scheduling.updateAppointment(world.desk, {
      appointmentId: plain,
      version: 2,
      packageId: null,
    });
    expect(removed.ok).toBe(true);
    expect(await linkOf(plain)).toMatchObject({ status: "RELEASED" });

    const wrongPatient = await bookLinked(world, sold.package.id, {
      patientId: world.patients.joao,
      startTime: "13:00",
    });
    expect(!wrongPatient.ok && wrongPatient.error.code).toBe("PACKAGE_WRONG_PATIENT_OR_SERVICE");
    const wrongService = await bookLinked(world, sold.package.id, {
      serviceId: world.services.retorno,
      roomId: null,
      startTime: "14:00",
    });
    expect(!wrongService.ok && wrongService.error.code).toBe("PACKAGE_WRONG_PATIENT_OR_SERVICE");
  });

  it("F06 → F10: appointments linked to a package do not generate charges in F09, and completing them debits the package balance", async () => {
    const sold = await soldPackage(world);
    const appointmentId = await mustBookLinked(world, sold.package.id);
    await moveTo(world.desk, appointmentId, ["CHECKED_IN"]);
    await moveTo(world.pro, appointmentId, ["IN_PROGRESS", "COMPLETED"]);
    expect(await db().charge.count({ where: { appointmentId } })).toBe(0);
    expect(await packageRow(sold.package.id)).toMatchObject({ usedSessions: 1 });
    // The completion is idempotent for the ledger: one debit movement.
    expect(await db().packageMovement.count({ where: { kind: "DEBIT" } })).toBe(1);
  });

  it("F10: a link that cannot be made rolls the booking back", async () => {
    const unknown = await bookLinked(world, "01928f9e-7a31-7c2e-9d10-4b6a1c0e2f11");
    expect(!unknown.ok && unknown.error.code).toBe("PACKAGE_NOT_FOUND");
    expect(await db().appointment.count()).toBe(0);
  });
});
