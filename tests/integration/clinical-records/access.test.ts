import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clinicalRecords } from "@/modules/clinical-records";
import { scheduling } from "@/modules/scheduling";
import { db } from "@/shared/db/client";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { appointmentFor, clinicalWorld, insertNote, type ClinicalWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: ClinicalWorld;
let noteId: string;
let appointmentId: string;
beforeEach(async () => {
  world = await clinicalWorld();
  appointmentId = await appointmentFor(world);
  noteId = (await insertNote(world, { appointmentId })).id;
});

describe("clinical access", () => {
  it("F07: front desk and professionals without an appointment with the patient are denied, and the denial is audited", async () => {
    const attempts = [
      // Front Desk, then a professional who never saw this patient (Bruno has no appointment with Maria).
      world.desk,
      world.brunoPro,
    ];
    for (const ctx of attempts) {
      const before = (await auditEvents({ action: "PERMISSION_DENIED" })).length;
      const record = await clinicalRecords.getClinicalRecord(ctx, { patientId: world.patients.maria });
      expect(!record.ok && record.error.code).toBe("AUTHZ_FORBIDDEN");
      const note = await clinicalRecords.getNote(ctx, noteId);
      expect(!note.ok && note.error.code).toBe("AUTHZ_FORBIDDEN");
      const list = await clinicalRecords.listPatientNotes(ctx, { patientId: world.patients.maria });
      expect(!list.ok && list.error.code).toBe("AUTHZ_FORBIDDEN");
      const after = (await auditEvents({ action: "PERMISSION_DENIED" })).length;
      expect(after - before).toBeGreaterThanOrEqual(3);
    }
  });

  it("F07: a professional with an appointment with the patient can read, and an administrator linked to a professional too", async () => {
    const ok = await clinicalRecords.getNote(world.pro, noteId);
    expect(ok.ok).toBe(true);
    // Bruno gets an appointment with Maria and now reads the finalized note of Ana.
    await appointmentFor(world, {
      professionalId: world.professionals.bruno,
      startTime: "14:00",
      status: [],
    });
    const colleague = await clinicalRecords.getNote(world.brunoPro, noteId);
    expect(colleague.ok).toBe(true);
    // Administrators without a professional link have no clinical access.
    const admin = await clinicalRecords.getNote(world.admin, noteId);
    expect(!admin.ok && admin.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F07: every note read produces an audit event", async () => {
    const count = async (entityType: string) =>
      (await auditEvents({ action: "READ_SENSITIVE" })).filter((event) => event.entityType === entityType)
        .length;
    const record = await clinicalRecords.getClinicalRecord(world.pro, {
      patientId: world.patients.maria,
      appointmentId,
    });
    expect(record.ok && record.value.current.kind).toBe("NOTE");
    expect(await count("patient")).toBe(1);
    expect(await count("clinical_note")).toBe(1);
    await clinicalRecords.getNote(world.pro, noteId);
    expect(await count("clinical_note")).toBe(2);
    await clinicalRecords.listPatientNotes(world.pro, { patientId: world.patients.maria });
    expect(await count("patient")).toBe(2);
    // A version is a read like any other.
    const version = await db().clinicalNoteVersion.create({
      data: {
        id: "0193a1b2-0000-7000-8000-00000000f001",
        organizationId: world.organizationId,
        noteId,
        versionNumber: 1,
        contentHtml: "<p>Antes</p>",
        contentText: "Antes",
        characters: 5,
        replacedById: world.pro.user.id,
      },
    });
    const opened = await clinicalRecords.getVersion(world.pro, version.id);
    expect(opened.ok && opened.value.html).toBe("<p>Antes</p>");
    expect(await count("clinical_note_version")).toBe(1);
  });

  it("F07: clinical alerts keep their history and are hidden from front desk", async () => {
    const created = await clinicalRecords.updateClinicalAlert(world.pro, {
      patientId: world.patients.maria,
      text: "Alergia a dipirona",
      version: 0,
    });
    expect(created.ok && created.value.version).toBe(1);
    const changed = await clinicalRecords.updateClinicalAlert(world.pro, {
      patientId: world.patients.maria,
      text: "Alergia a dipirona e penicilina",
      version: 1,
    });
    expect(changed.ok && changed.value.version).toBe(2);
    const stale = await clinicalRecords.updateClinicalAlert(world.pro, {
      patientId: world.patients.maria,
      text: "x",
      version: 1,
    });
    expect(!stale.ok && stale.error.code).toBe("CLINICAL_NOTE_STALE");
    const history = await db().clinicalAlertChange.findMany({});
    expect(history.map((row) => row.previousText)).toEqual(["Alergia a dipirona"]);
    const record = await clinicalRecords.getClinicalRecord(world.pro, { patientId: world.patients.maria });
    expect(record.ok && record.value.header.alert.text).toBe("Alergia a dipirona e penicilina");
    const desk = await clinicalRecords.updateClinicalAlert(world.desk, {
      patientId: world.patients.maria,
      text: "x",
      version: 2,
    });
    expect(!desk.ok && desk.error.code).toBe("AUTHZ_FORBIDDEN");
    const tooLong = await clinicalRecords.updateClinicalAlert(world.pro, {
      patientId: world.patients.maria,
      text: "a".repeat(501),
      version: 2,
    });
    expect(!tooLong.ok && tooLong.error.code).toBe("CLINICAL_ALERT_TOO_LONG");
  });

  it("F06→F07: the appointment exposes its note state to clinical readers and nobody else", async () => {
    const bySchedulerPro = await scheduling.getAppointment(world.pro, appointmentId);
    expect(bySchedulerPro.ok && bySchedulerPro.value.clinicalNote).toEqual({ state: "FINALIZED" });
    const byDesk = await scheduling.getAppointment(world.desk, appointmentId);
    expect(byDesk.ok && byDesk.value.clinicalNote).toBeNull();
    // A draft is reported to its author only.
    const second = await appointmentFor(world, { startTime: "15:00" });
    await insertNote(world, { appointmentId: second, status: "DRAFT" });
    const own = await scheduling.getAppointment(world.pro, second);
    expect(own.ok && own.value.clinicalNote).toEqual({ state: "DRAFT" });
    const none = await appointmentFor(world, { startTime: "16:00" });
    const empty = await scheduling.getAppointment(world.pro, none);
    expect(empty.ok && empty.value.clinicalNote).toEqual({ state: "NONE" });
  });

  it("F06→F07: the record shows the appointment's date, service and professional", async () => {
    const record = await clinicalRecords.getClinicalRecord(world.pro, { patientId: world.patients.maria });
    expect(record.ok).toBe(true);
    if (!record.ok) return;
    const item = record.value.notes.items[0];
    expect(item?.serviceName).toBe("Consulta");
    expect(item?.professionalName).toBe("Dra. Ana");
    expect(item?.timeZone).toBe("America/Sao_Paulo");
    const note = await clinicalRecords.getNote(world.pro, noteId);
    expect(note.ok && note.value.appointment?.serviceName).toBe("Consulta");
  });

  it("F07→F14: notes expose author, timestamps, addenda and attachments through their tables", async () => {
    const row = await db().clinicalNote.findUniqueOrThrow({
      where: { id: noteId },
      include: { addenda: true, attachments: true },
    });
    expect(row.authorUserId).toBe(world.pro.user.id);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.finalizedAt).toBeInstanceOf(Date);
    expect(row.locksAt.getTime() - row.createdAt.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(Array.isArray(row.addenda)).toBe(true);
    expect(Array.isArray(row.attachments)).toBe(true);
  });
});
