import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/shared/db/client";
import { newId } from "@/shared/kernel/ids";
import { closeHelpers, resetDatabase } from "../helpers";
import { appointmentFor, clinicalWorld, insertNote, type ClinicalWorld } from "./support";

beforeEach(resetDatabase);
afterAll(closeHelpers);

let world: ClinicalWorld;
beforeEach(async () => {
  world = await clinicalWorld();
});

const HOUR = 60 * 60 * 1000;

describe("clinical records schema", () => {
  it("F07: the database refuses content changes after the 24-hour lock", async () => {
    const locked = await insertNote(world, { createdAt: new Date(Date.now() - 25 * HOUR) });
    await expect(
      db().clinicalNote.update({ where: { id: locked.id }, data: { contentHtml: "<p>Alterado</p>" } }),
    ).rejects.toThrow(/CLINICAL_NOTE_LOCKED/);
    // Status columns may still change, so the auto-finalization job works.
    const draft = await insertNote(world, { createdAt: new Date(Date.now() - 25 * HOUR), status: "DRAFT" });
    const finalized = await db().clinicalNote.update({
      where: { id: draft.id },
      data: { status: "FINALIZED", finalizedAt: new Date(), autoFinalized: true },
    });
    expect(finalized.status).toBe("FINALIZED");
  });

  it("F07: a note stays editable inside the 24 hours", async () => {
    const note = await insertNote(world, { createdAt: new Date(Date.now() - 23 * HOUR) });
    const updated = await db().clinicalNote.update({
      where: { id: note.id },
      data: { contentHtml: "<p>Alterado</p>", contentText: "Alterado", characters: 8 },
    });
    expect(updated.contentText).toBe("Alterado");
  });

  it("F07: the lock instant cannot be moved or inconsistent with the creation", async () => {
    const note = await insertNote(world);
    await expect(
      db().clinicalNote.update({
        where: { id: note.id },
        data: { locksAt: new Date(note.locksAt.getTime() + 24 * HOUR) },
      }),
    ).rejects.toThrow();
    await expect(
      db().clinicalNote.create({
        data: {
          id: newId(),
          organizationId: world.organizationId,
          patientId: world.patients.maria,
          kind: "STANDALONE",
          professionalId: world.professionals.ana,
          authorUserId: world.pro.user.id,
          contentHtml: "<p>x</p>",
          contentText: "x",
          characters: 1,
          locksAt: new Date(Date.now() + 100 * HOUR),
        },
      }),
    ).rejects.toThrow(/ck_clinical_note_lock/);
  });

  it("F07: an appointment has at most one note", async () => {
    const appointmentId = await appointmentFor(world);
    await insertNote(world, { appointmentId });
    await expect(insertNote(world, { appointmentId })).rejects.toThrow();
  });

  it("F07: clinical records cannot be deleted by the application role", async () => {
    const note = await insertNote(world);
    await expect(db().clinicalNote.delete({ where: { id: note.id } })).rejects.toThrow(/permission denied/);
  });

  it("F07: versions and addenda are append-only", async () => {
    const note = await insertNote(world, { createdAt: new Date(Date.now() - 25 * HOUR) });
    const addendum = await db().clinicalNoteAddendum.create({
      data: {
        id: newId(),
        organizationId: world.organizationId,
        noteId: note.id,
        authorUserId: world.pro.user.id,
        professionalId: world.professionals.ana,
        contentHtml: "<p>Adendo</p>",
        contentText: "Adendo",
        characters: 6,
      },
    });
    await expect(
      db().clinicalNoteAddendum.update({ where: { id: addendum.id }, data: { contentText: "x" } }),
    ).rejects.toThrow(/permission denied/);
    await expect(db().clinicalNoteAddendum.delete({ where: { id: addendum.id } })).rejects.toThrow(
      /permission denied/,
    );
  });
});
