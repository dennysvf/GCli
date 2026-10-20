import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { closeHelpers, createOrganization, resetDatabase } from "../helpers";
import { insertNote } from "../clinical-records/support";
import { schedulingWorld } from "../scheduling/support";
import {
  idOf,
  insertPastAppointments,
  privacy,
  privacyWorld,
  seedRichHistory,
  timelinePage,
  wholeTimeline,
  type PrivacyWorld,
  type RichHistory,
} from "./support";

let world: PrivacyWorld;
let history: RichHistory;

beforeAll(async () => {
  await resetDatabase();
  world = await privacyWorld();
  history = await seedRichHistory(world);
});
afterAll(closeHelpers);

describe("patient timeline", () => {
  it("F14: the timeline lists every event type for a viewer who may see them all", async () => {
    const items = await wholeTimeline(world.linkedAdmin, { patientId: history.patientId });
    const kinds = new Set(items.map((item) => item.kind));
    expect([...kinds].sort()).toEqual(
      [
        "APPOINTMENT",
        "CHARGE_CREATED",
        "CLINICAL_ADDENDUM_ADDED",
        "CLINICAL_NOTE_FINALIZED",
        "CONSENT_RECORDED",
        "DOCUMENT_GENERATED",
        "DOCUMENT_UPLOADED",
        "PATIENT_REGISTERED",
        "PAYMENT_RECEIVED",
        "PAYMENT_REFUNDED",
      ].sort(),
    );
    const refund = items.find((item) => item.kind === "PAYMENT_REFUNDED");
    expect(refund).toMatchObject({
      amountMinor: "-5000",
      currency: "BRL",
      chargeNumber: history.chargeNumber,
    });
    const charge = items.find((item) => item.kind === "CHARGE_CREATED" && idOf(item) === history.chargeId);
    expect(charge).toMatchObject({ netMinor: "25000", itemName: "Consulta", status: "PARTIALLY_PAID" });
  });

  it("F14: events are ordered newest first across all sources", async () => {
    const items = await wholeTimeline(world.linkedAdmin, { patientId: history.patientId });
    for (let index = 1; index < items.length; index++) {
      const previous = items[index - 1]!.occurredAt;
      expect(items[index]!.occurredAt <= previous).toBe(true);
    }
    const keys = items.map((item) => item.key);
    expect(keys.indexOf(`APPOINTMENT:${history.appointments.future}`)).toBeLessThan(
      keys.indexOf(`APPOINTMENT:${history.appointments.ana}`),
    );
    expect(items.at(-1)?.kind).toBe("PATIENT_REGISTERED");
  });

  it("F14: pages hold 50 events and the cursor continues without gaps or repeats", async () => {
    await insertPastAppointments(world, { patientId: world.patients.joao, count: 120 });
    const first = await timelinePage(world.linkedAdmin, { patientId: world.patients.joao });
    expect(first.items).toHaveLength(50);
    expect(first.pageSize).toBe(50);
    expect(first.nextCursor).not.toBeNull();
    const all = await wholeTimeline(world.linkedAdmin, { patientId: world.patients.joao });
    // 120 appointments and the registration.
    expect(all).toHaveLength(121);
    expect(new Set(all.map((item) => item.key)).size).toBe(121);
    expect(all.slice(0, 50).map((item) => item.key)).toEqual(first.items.map((item) => item.key));
  });

  it("F14: an appointment event carries its current status and status history", async () => {
    const items = await wholeTimeline(world.linkedAdmin, {
      patientId: history.patientId,
      groups: ["APPOINTMENTS"],
    });
    const event = items.find((item) => item.key === `APPOINTMENT:${history.appointments.ana}`);
    expect(event?.kind).toBe("APPOINTMENT");
    if (event?.kind !== "APPOINTMENT") return;
    expect(event).toMatchObject({
      status: "COMPLETED",
      serviceName: "Consulta",
      professionalName: "Dra. Ana",
      roomName: "Sala 1",
      timeZone: "America/Sao_Paulo",
    });
    expect(event.history.map((line) => line.toStatus)).toEqual([
      "SCHEDULED",
      "CONFIRMED",
      "CHECKED_IN",
      "IN_PROGRESS",
      "COMPLETED",
    ]);
    expect(event.history.every((line) => line.changedByName === "Recepção Teste")).toBe(true);
  });

  it("F14: drafts never appear and auto-finalized notes are labelled", async () => {
    const auto = await insertNote(world, { patientId: world.patients.maria, html: "<p>Automático.</p>" });
    await db().clinicalNote.update({ where: { id: auto.id }, data: { autoFinalized: true } });
    const items = await wholeTimeline(world.linkedAdmin, {
      patientId: history.patientId,
      groups: ["CLINICAL"],
    });
    const ids = items.map(idOf);
    expect(ids).not.toContain(history.notes.draft);
    expect(ids).toContain(history.notes.ana);
    const labelled = items.find((item) => idOf(item) === auto.id);
    expect(labelled).toMatchObject({ kind: "CLINICAL_NOTE_FINALIZED", autoFinalized: true });
    const ana = items.find((item) => idOf(item) === history.notes.ana);
    expect(ana).toMatchObject({ professionalName: "Dra. Ana", serviceName: "Consulta", addendaCount: 1 });
    // The list never carries note text.
    expect(JSON.stringify(items)).not.toContain("melhora da dor lombar");
  });

  it("F14: failed documents are not events and archived or erased ones keep their event", async () => {
    await db().patientDocument.update({
      where: { id: history.documents.personal },
      data: {
        archivedAt: new Date(),
        archivedById: world.admin.user.id,
        archiveReason: "LGPD_ANONYMIZATION",
        erasedAt: new Date(),
        erasedById: world.admin.user.id,
      },
    });
    const items = await wholeTimeline(world.linkedAdmin, {
      patientId: history.patientId,
      groups: ["DOCUMENTS"],
    });
    const ids = items.map(idOf);
    expect(ids).not.toContain(history.documents.failed);
    expect(items.find((item) => idOf(item) === history.documents.personal)).toMatchObject({
      archived: true,
      erased: true,
    });
    expect(items.find((item) => idOf(item) === history.documents.generated)?.kind).toBe("DOCUMENT_GENERATED");
    await db().patientDocument.update({
      where: { id: history.documents.personal },
      data: { archivedAt: null, archivedById: null, archiveReason: null, erasedAt: null, erasedById: null },
    });
  });

  it("F14: the group filter returns only the chosen groups", async () => {
    const items = await wholeTimeline(world.linkedAdmin, {
      patientId: history.patientId,
      groups: ["DOCUMENTS"],
    });
    expect(items.length).toBe(3);
    expect(
      items.every((item) => item.kind === "DOCUMENT_UPLOADED" || item.kind === "DOCUMENT_GENERATED"),
    ).toBe(true);
    const two = await wholeTimeline(world.linkedAdmin, {
      patientId: history.patientId,
      groups: ["FINANCIAL", "REGISTRATION"],
    });
    expect(new Set(two.map((item) => item.group))).toEqual(new Set(["FINANCIAL", "REGISTRATION"]));
  });

  it("F14: the period filter keeps events of the chosen local dates", async () => {
    const appointment = await db().appointment.findUniqueOrThrow({ where: { id: history.appointments.ana } });
    const localDate = dateInTimeZone(appointment.startsAt, "America/Sao_Paulo");
    const items = await wholeTimeline(world.linkedAdmin, {
      patientId: history.patientId,
      from: localDate,
      to: localDate,
    });
    expect(items.map((item) => item.key)).toContain(`APPOINTMENT:${history.appointments.ana}`);
    expect(items.map((item) => item.key)).not.toContain(`APPOINTMENT:${history.appointments.future}`);
    expect(
      items.every((item) => dateInTimeZone(new Date(item.occurredAt), "America/Sao_Paulo") === localDate),
    ).toBe(true);
    const empty = await timelinePage(world.linkedAdmin, {
      patientId: history.patientId,
      from: "2020-01-01",
      to: "2020-01-31",
    });
    expect(empty.items).toEqual([]);
    expect(empty.nextCursor).toBeNull();
  });

  it("F14: a period ending before it starts is rejected", async () => {
    const result = await privacy.getPatientTimeline(world.linkedAdmin, {
      patientId: history.patientId,
      from: "2026-03-10",
      to: "2026-03-01",
    });
    expect(!result.ok && result.error.code).toBe("PRIVACY_PERIOD_INVALID");
  });

  it("F14: a tampered cursor is rejected", async () => {
    const result = await privacy.getPatientTimeline(world.linkedAdmin, {
      patientId: history.patientId,
      cursor: "eyJ0IjoibmFvIn0",
    });
    expect(!result.ok && result.error.code).toBe("PRIVACY_CURSOR_INVALID");
  });

  it("F14: no event of another organization ever appears", async () => {
    const otherOrg = await createOrganization("Outra Clínica");
    const other = await schedulingWorld(otherOrg);
    const foreign = await privacy.getPatientTimeline(world.linkedAdmin, { patientId: other.patients.maria });
    expect(!foreign.ok && foreign.error.code).toBe("PRIVACY_PATIENT_NOT_FOUND");
    const own = await wholeTimeline(world.linkedAdmin, { patientId: history.patientId });
    const otherIds = new Set([other.patients.maria, other.patients.joao]);
    expect(own.some((item) => otherIds.has(idOf(item)))).toBe(false);
  });
});
