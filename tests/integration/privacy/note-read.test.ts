import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { closeHelpers, resetDatabase } from "../helpers";
import { insertNote } from "../clinical-records/support";
import { booking, bookOrThrow, day } from "../scheduling/support";
import { moveTo } from "../billing/support";
import {
  privacy,
  privacyWorld,
  seedRichHistory,
  timelinePage,
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

function noteReads(noteId: string) {
  return db().auditEvent.count({
    where: { action: "READ_SENSITIVE", entityType: "clinical_note", entityId: noteId },
  });
}

describe("clinical note expansion", () => {
  it("F14: expanding a clinical note records an audit read event", async () => {
    const before = await noteReads(history.notes.ana);
    const opened = await privacy.getTimelineNote(world.pro, {
      patientId: history.patientId,
      noteId: history.notes.ana,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.html).toContain("Paciente relata melhora da dor lombar.");
    expect(opened.value.addenda).toHaveLength(1);
    expect(opened.value.addenda[0]?.html).toContain("Retorno em 30 dias.");
    expect(opened.value.serviceName).toBe("Consulta");
    expect(await noteReads(history.notes.ana)).toBe(before + 1);
    const last = await db().auditEvent.findFirst({
      where: { action: "READ_SENSITIVE", entityType: "clinical_note", entityId: history.notes.ana },
      orderBy: { occurredAt: "desc" },
    });
    expect(last?.actorUserId).toBe(world.pro.user.id);
    expect(last?.ipAddress).not.toBeNull();
  });

  it("F14: each expansion is a separate audited read", async () => {
    const before = await noteReads(history.notes.ana);
    for (let index = 0; index < 2; index++) {
      const opened = await privacy.getTimelineNote(world.pro, {
        patientId: history.patientId,
        noteId: history.notes.ana,
      });
      expect(opened.ok).toBe(true);
    }
    expect(await noteReads(history.notes.ana)).toBe(before + 2);
  });

  it("F14: a page with clinical items records one audited read of the patient", async () => {
    const before = await db().auditEvent.count({
      where: { action: "READ_SENSITIVE", entityType: "patient", entityId: history.patientId },
    });
    const notesBefore = await noteReads(history.notes.ana);
    await timelinePage(world.pro, { patientId: history.patientId });
    const reads = await db().auditEvent.findMany({
      where: { action: "READ_SENSITIVE", entityType: "patient", entityId: history.patientId },
      orderBy: { occurredAt: "desc" },
    });
    expect(reads).toHaveLength(before + 1);
    const metadata = reads[0]?.metadata as { noteIds: string[]; addendumIds: string[]; patientId: string };
    expect(metadata.patientId).toBe(history.patientId);
    expect(metadata.noteIds).toContain(history.notes.ana);
    expect(metadata.addendumIds).toContain(history.addendumId);
    // Listing is not reading: the note itself has no new read.
    expect(await noteReads(history.notes.ana)).toBe(notesBefore);
  });

  it("F14: a page without clinical items records no audit event", async () => {
    const before = await db().auditEvent.count();
    await timelinePage(world.desk, { patientId: history.patientId });
    expect(await db().auditEvent.count()).toBe(before);
  });

  it("F14: front desk cannot expand a clinical note", async () => {
    const before = await noteReads(history.notes.ana);
    const denied = await privacy.getTimelineNote(world.desk, {
      patientId: history.patientId,
      noteId: history.notes.ana,
    });
    expect(!denied.ok && denied.error.code).toBe("AUTHZ_FORBIDDEN");
    expect(await noteReads(history.notes.ana)).toBe(before);
    const denial = await db().auditEvent.findFirst({
      where: { action: "PERMISSION_DENIED", actorUserId: world.desk.user.id },
      orderBy: { occurredAt: "desc" },
    });
    expect(denial).not.toBeNull();
  });

  it("F14: a note of another patient is not opened through this patient's timeline", async () => {
    const booked = await bookOrThrow(
      world.desk,
      booking(world, { patientId: world.patients.joao, date: day(2), startTime: "11:00" }),
    );
    await moveTo(world.desk, booked.appointmentId, ["CHECKED_IN"]);
    const other = await insertNote(world, {
      patientId: world.patients.joao,
      appointmentId: booked.appointmentId,
    });
    const result = await privacy.getTimelineNote(world.pro, {
      patientId: history.patientId,
      noteId: other.id,
    });
    expect(!result.ok && result.error.code).toBe("PRIVACY_NOTE_NOT_FOUND");
    expect(await noteReads(other.id)).toBe(0);
  });
});
