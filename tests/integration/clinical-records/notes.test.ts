import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clinicalRecords, CLINICAL_RECORDS_EVENTS } from "@/modules/clinical-records";
import { db } from "@/shared/db/client";
import { eventBus } from "@/shared/db/transaction";
import type { DomainEvent } from "@/shared/events/event-bus";
import { autoFinalizeExpiredDrafts } from "@/worker/jobs/clinical-records";
import { auditEvents, closeHelpers, resetDatabase } from "../helpers";
import { appointmentFor, clinicalWorld, insertNote, type ClinicalWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

const received: DomainEvent[] = [];
for (const type of Object.values(CLINICAL_RECORDS_EVENTS)) {
  eventBus.subscribe(type, async (event) => {
    received.push(event);
  });
}

let world: ClinicalWorld;
beforeEach(async () => {
  received.length = 0;
  world = await clinicalWorld();
});

const HOUR = 60 * 60 * 1000;
const html = (text: string) => `<p>${text}</p>`;

async function startDraft(
  text = "Dor lombar há 3 semanas.",
  options: Parameters<typeof appointmentFor>[1] = {},
) {
  const appointmentId = await appointmentFor(world, options);
  const saved = await clinicalRecords.saveDraft(world.pro, { appointmentId, html: html(text) });
  if (!saved.ok) throw new Error(`saveDraft failed: ${saved.error.code}`);
  return { appointmentId, ...saved.value };
}

describe("clinical notes", () => {
  it("F07: professional can create a note only for an appointment with status Chegou, Em atendimento, or Concluído where they are the professional", async () => {
    const scheduled = await appointmentFor(world, { status: [], startTime: "09:00" });
    const confirmed = await appointmentFor(world, { status: ["CONFIRMED"], startTime: "11:00" });
    for (const appointmentId of [scheduled, confirmed]) {
      const refused = await clinicalRecords.saveDraft(world.pro, { appointmentId, html: html("x") });
      expect(!refused.ok && refused.error.code).toBe("CLINICAL_APPOINTMENT_STATUS_INVALID");
    }
    for (const [index, status] of [
      ["CHECKED_IN"],
      ["CHECKED_IN", "IN_PROGRESS"],
      ["CHECKED_IN", "IN_PROGRESS", "COMPLETED"],
    ].entries()) {
      const appointmentId = await appointmentFor(world, { status, startTime: `${12 + index}:00` });
      const created = await clinicalRecords.saveDraft(world.pro, { appointmentId, html: html("Texto") });
      expect(created.ok).toBe(true);
      const row = await db().clinicalNote.findFirstOrThrow({ where: { appointmentId } });
      expect(row.kind).toBe("ENCOUNTER");
      expect(row.professionalId).toBe(world.professionals.ana);
    }
    // Another professional cannot write the note of Ana's appointment.
    const anas = await appointmentFor(world, { startTime: "16:00" });
    const other = await clinicalRecords.saveDraft(world.brunoPro, { appointmentId: anas, html: html("x") });
    expect(!other.ok && other.error.code).toBe("CLINICAL_NOT_APPOINTMENT_PROFESSIONAL");
    // Front desk has no clinical permission at all.
    const desk = await clinicalRecords.saveDraft(world.desk, { appointmentId: anas, html: html("x") });
    expect(!desk.ok && desk.error.code).toBe("AUTHZ_FORBIDDEN");
  });

  it("F07: two simultaneous first saves of the same appointment leave one note", async () => {
    const appointmentId = await appointmentFor(world);
    const results = await Promise.all([
      clinicalRecords.saveDraft(world.pro, { appointmentId, html: html("Aba 1") }),
      clinicalRecords.saveDraft(world.pro, { appointmentId, html: html("Aba 2") }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const failed = results.find((result) => !result.ok);
    expect(failed && !failed.ok && failed.error.code).toBe("CLINICAL_NOTE_STALE");
    expect(await db().clinicalNote.count({ where: { appointmentId } })).toBe(1);
  });

  it("F07: draft autosaves keep the latest content and reopening shows it", async () => {
    const draft = await startDraft("Primeira versão.");
    const second = await clinicalRecords.saveDraft(world.pro, {
      noteId: draft.noteId,
      version: draft.version,
      html: html("Segunda versão, mais longa."),
    });
    expect(second.ok && second.value.version).toBe(draft.version + 1);
    const opened = await clinicalRecords.getNote(world.pro, draft.noteId);
    expect(opened.ok && opened.value.state).toBe("DRAFT");
    expect(opened.ok && opened.value.html).toBe(html("Segunda versão, mais longa."));
  });

  it("F07: concurrent saves from two tabs do not overwrite each other", async () => {
    const draft = await startDraft("Original.");
    const first = await clinicalRecords.saveDraft(world.pro, {
      noteId: draft.noteId,
      version: draft.version,
      html: html("Aba A"),
    });
    expect(first.ok).toBe(true);
    const stale = await clinicalRecords.saveDraft(world.pro, {
      noteId: draft.noteId,
      version: draft.version,
      html: html("Aba B"),
    });
    expect(!stale.ok && stale.error.code).toBe("CLINICAL_NOTE_STALE");
    const row = await db().clinicalNote.findUniqueOrThrow({ where: { id: draft.noteId } });
    expect(row.contentText).toBe("Aba A");
  });

  it("F07: the sanitizer keeps only allowed formatting and the limits are enforced", async () => {
    const appointmentId = await appointmentFor(world);
    const saved = await clinicalRecords.saveDraft(world.pro, {
      appointmentId,
      html: '<h1>Título</h1><p onclick="x()">Texto <strong>forte</strong><script>alert(1)</script></p><img src=x>',
    });
    expect(saved.ok).toBe(true);
    const row = await db().clinicalNote.findFirstOrThrow({ where: { appointmentId } });
    expect(row.contentHtml).toBe("<h2>Título</h2><p>Texto <strong>forte</strong></p>");
    const draft = saved.ok ? saved.value : null;
    const tooLong = await clinicalRecords.saveDraft(world.pro, {
      noteId: draft?.noteId,
      version: draft?.version,
      html: html("a".repeat(50_001)),
    });
    expect(!tooLong.ok && tooLong.error.code).toBe("CLINICAL_NOTE_TOO_LONG");
  });

  it("F07: finalizing makes the note visible to other authorized professionals and drafts stay private", async () => {
    const draft = await startDraft("Texto confidencial do rascunho.");
    // Bruno attends Maria too, so he is authorized to read her records.
    await appointmentFor(world, {
      professionalId: world.professionals.bruno,
      startTime: "14:00",
      status: [],
    });
    const hidden = await clinicalRecords.getNote(world.brunoPro, draft.noteId);
    expect(!hidden.ok && hidden.error.code).toBe("CLINICAL_NOTE_NOT_FOUND");
    const listBefore = await clinicalRecords.listPatientNotes(world.brunoPro, {
      patientId: world.patients.maria,
    });
    expect(listBefore.ok && listBefore.value.items).toHaveLength(0);

    const finalized = await clinicalRecords.finalizeNote(world.pro, {
      noteId: draft.noteId,
      version: draft.version,
      html: html("Texto final."),
    });
    expect(finalized.ok && finalized.value.status).toBe("FINALIZED");
    const visible = await clinicalRecords.getNote(world.brunoPro, draft.noteId);
    expect(visible.ok && visible.value.state).toBe("FINALIZED");
    expect(received.map((event) => event.type)).toContain(CLINICAL_RECORDS_EVENTS.noteFinalized);
    const empty = await startDraft("   ", { startTime: "17:00" }).catch((error: Error) => error.message);
    expect(String(empty)).toContain("CLINICAL_NOTE_EMPTY");
  });

  it("F07: a finalized note is editable by its author until 24 hours after creation and then only addenda are allowed", async () => {
    const appointmentId = await appointmentFor(world);
    // Created 23 hours ago: one hour of editing left.
    const note = await insertNote(world, { appointmentId, createdAt: new Date(Date.now() - 23 * HOUR) });
    const started = await clinicalRecords.startEdit(world.pro, { noteId: note.id, version: note.version });
    expect(started.ok).toBe(true);
    const version = started.ok ? started.value.version : 0;
    const saved = await clinicalRecords.publishEdit(world.pro, {
      noteId: note.id,
      version,
      html: html("Editado"),
    });
    expect(saved.ok).toBe(true);

    const lockedAppointment = await appointmentFor(world, { startTime: "15:00" });
    const locked = await insertNote(world, {
      appointmentId: lockedAppointment,
      createdAt: new Date(Date.now() - 25 * HOUR),
    });
    const refused = await clinicalRecords.startEdit(world.pro, {
      noteId: locked.id,
      version: locked.version,
    });
    expect(!refused.ok && refused.error.code).toBe("CLINICAL_NOTE_LOCKED");
    expect(!refused.ok && refused.error.params?.date).toBeTruthy();
    // Even a direct update of the content fails in the database.
    await expect(
      db().clinicalNote.update({ where: { id: locked.id }, data: { contentHtml: "<p>x</p>" } }),
    ).rejects.toThrow(/CLINICAL_NOTE_LOCKED/);
    const addendum = await clinicalRecords.addAddendum(world.pro, {
      noteId: locked.id,
      html: html("Complemento."),
    });
    expect(addendum.ok).toBe(true);
    const early = await clinicalRecords.addAddendum(world.pro, {
      noteId: note.id,
      html: html("Cedo demais"),
    });
    expect(!early.ok && early.error.code).toBe("CLINICAL_ADDENDUM_BEFORE_LOCK");
  });

  it("F07: each edit within 24 hours stores a previous version", async () => {
    const appointmentId = await appointmentFor(world);
    const note = await insertNote(world, { appointmentId, html: html("Original") });
    let version = note.version;
    for (const text of ["Primeira edição", "Segunda edição"]) {
      const started = await clinicalRecords.startEdit(world.pro, { noteId: note.id, version });
      if (!started.ok) throw new Error(started.error.code);
      // Autosaves of the edit draft do not create versions.
      const draft = await clinicalRecords.saveEditDraft(world.pro, {
        noteId: note.id,
        version: started.value.version,
        html: html(`${text} (rascunho)`),
      });
      if (!draft.ok) throw new Error(draft.error.code);
      const published = await clinicalRecords.publishEdit(world.pro, {
        noteId: note.id,
        version: draft.value.version,
        html: html(text),
      });
      if (!published.ok) throw new Error(published.error.code);
      version = published.value.version;
    }
    const versions = await db().clinicalNoteVersion.findMany({
      where: { noteId: note.id },
      orderBy: { versionNumber: "asc" },
    });
    expect(versions.map((row) => row.contentText)).toEqual(["Original", "Primeira edição"]);
    // The pending edit is invisible to colleagues until published, and discarding clears it.
    const again = await clinicalRecords.startEdit(world.pro, { noteId: note.id, version });
    const discarded = await clinicalRecords.discardEdit(world.pro, {
      noteId: note.id,
      version: again.ok ? again.value.version : 0,
    });
    expect(discarded.ok).toBe(true);
    await expect(
      db().$executeRaw`UPDATE clinical_note_version SET content_text = 'x' WHERE note_id = ${note.id}::uuid`,
    ).rejects.toThrow();
  });

  it("F07: an expired draft is auto-finalized by the job and visible to colleagues", async () => {
    const appointmentId = await appointmentFor(world);
    const note = await insertNote(world, {
      appointmentId,
      status: "DRAFT",
      createdAt: new Date(Date.now() - 25 * HOUR),
    });
    await appointmentFor(world, {
      professionalId: world.professionals.bruno,
      startTime: "14:00",
      status: [],
    });
    expect(await autoFinalizeExpiredDrafts()).toBe(1);
    const row = await db().clinicalNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(row.status).toBe("FINALIZED");
    expect(row.autoFinalized).toBe(true);
    const events = await auditEvents({ entityId: note.id });
    expect(events.some((event) => event.actorType === "SYSTEM" && event.action === "UPDATE")).toBe(true);
    expect(received.some((event) => event.payload.automatic === true)).toBe(true);
    expect(await autoFinalizeExpiredDrafts()).toBe(0);
    const seen = await clinicalRecords.getNote(world.brunoPro, note.id);
    expect(seen.ok && seen.value.state).toBe("LOCKED");
  });

  it("F07: standalone notes need a past attended appointment with the professional", async () => {
    const refused = await clinicalRecords.saveDraft(world.pro, {
      patientId: world.patients.maria,
      html: html("Avulso"),
    });
    expect(!refused.ok && refused.error.code).toBe("CLINICAL_STANDALONE_NOT_ALLOWED");
    const appointmentId = await appointmentFor(world);
    // Moves the attended appointment into the past.
    await db().$executeRaw`UPDATE appointment SET starts_at = starts_at - interval '3 days',
      ends_at = ends_at - interval '3 days' WHERE id = ${appointmentId}::uuid`;
    const allowed = await clinicalRecords.saveDraft(world.pro, {
      patientId: world.patients.maria,
      html: html("Avulso"),
    });
    expect(allowed.ok).toBe(true);
    const row = await db().clinicalNote.findFirstOrThrow({ where: { patientId: world.patients.maria } });
    expect(row.kind).toBe("STANDALONE");
  });

  it("F07: audit entries never contain clinical text", async () => {
    const secret = "SEGREDO-CLINICO-12345";
    const draft = await startDraft(`Paciente relata ${secret}.`);
    const finalized = await clinicalRecords.finalizeNote(world.pro, {
      noteId: draft.noteId,
      version: draft.version,
      html: html(`Texto final ${secret}`),
    });
    expect(finalized.ok).toBe(true);
    const events = await db().auditEvent.findMany({});
    expect(JSON.stringify(events)).not.toContain(secret);
    expect(events.some((event) => event.entityType === "clinical_note")).toBe(true);
  });

  it("F07: clinical queries ignore other organizations", async () => {
    const draft = await startDraft("Nota da clínica A.");
    const other = await clinicalWorld();
    const result = await clinicalRecords.getNote(other.pro, draft.noteId);
    expect(result.ok).toBe(false);
    expect(await db().clinicalNote.count({ where: { organizationId: other.organizationId } })).toBe(0);
  });
});
