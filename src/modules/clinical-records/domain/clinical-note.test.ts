import { describe, expect, it } from "vitest";
import { validateAddendum } from "./addendum";
import { ClinicalNote, type NoteContent } from "./clinical-note";
import { LOCK_WINDOW_MS, NOTE_MAX_CHARACTERS } from "./limits";

const AUTHOR = "user-author";
const NOW = new Date("2026-10-06T17:10:00.000Z");

function content(text: string): NoteContent {
  return { html: `<p>${text}</p>`, text, characters: text.length };
}

function draft(text = "Dor lombar.") {
  const started = ClinicalNote.start({
    id: "note-1",
    organizationId: "org-1",
    patientId: "patient-1",
    appointmentId: "appointment-1",
    professionalId: "professional-1",
    authorUserId: AUTHOR,
    content: content(text),
    now: NOW,
  });
  if (!started.ok) throw new Error("start failed");
  return started.value;
}

function finalized(text = "Dor lombar.") {
  const note = draft(text);
  const result = note.finalize(AUTHOR, content(text), NOW);
  if (!result.ok) throw new Error("finalize failed");
  return note;
}

const at = (ms: number) => new Date(NOW.getTime() + ms);

describe("clinical note lifecycle", () => {
  it("F07: the note locks 24 hours after creation", () => {
    const note = finalized();
    expect(note.effectiveState(at(LOCK_WINDOW_MS - 1000))).toBe("FINALIZED");
    expect(note.effectiveState(at(LOCK_WINDOW_MS))).toBe("LOCKED");
    const late = note.startEdit(AUTHOR, at(LOCK_WINDOW_MS));
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.code).toBe("CLINICAL_NOTE_LOCKED");
    expect(note.snapshot.locksAt.getTime() - note.snapshot.createdAt.getTime()).toBe(LOCK_WINDOW_MS);
  });

  it("F07: an expired draft is auto-finalized", () => {
    const note = draft();
    expect(note.autoFinalize(at(LOCK_WINDOW_MS - 1)).finalized).toBe(false);
    expect(note.autoFinalize(at(LOCK_WINDOW_MS))).toEqual({ finalized: true, discardedEdit: false });
    expect(note.snapshot.status).toBe("FINALIZED");
    expect(note.snapshot.autoFinalized).toBe(true);
    expect(note.snapshot.finalizedById).toBeNull();
    expect(note.isVisibleToOthers(at(LOCK_WINDOW_MS))).toBe(true);
  });

  it("F07: a pending edit draft is discarded when the note locks", () => {
    const note = finalized();
    note.startEdit(AUTHOR, at(1000));
    expect(note.autoFinalize(at(LOCK_WINDOW_MS))).toEqual({ finalized: false, discardedEdit: true });
    expect(note.snapshot.editDraft).toBeNull();
  });

  it("F07: publishing an edit returns the replaced content as a version", () => {
    const note = finalized("Versão original.");
    expect(note.startEdit(AUTHOR, at(1000)).ok).toBe(true);
    expect(note.saveEditDraft(AUTHOR, content("Versão corrigida."), at(2000)).ok).toBe(true);
    const published = note.publishEdit(AUTHOR, content("Versão corrigida."), at(3000));
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.versionNumber).toBe(1);
    expect(published.value.content.text).toBe("Versão original.");
    expect(note.snapshot.content.text).toBe("Versão corrigida.");
    expect(note.snapshot.editDraft).toBeNull();
    note.startEdit(AUTHOR, at(4000));
    const second = note.publishEdit(AUTHOR, content("Terceira."), at(5000));
    expect(second.ok && second.value.versionNumber).toBe(2);
  });

  it("F07: autosaves of the edit draft do not create versions", () => {
    const note = finalized();
    note.startEdit(AUTHOR, at(1000));
    note.saveEditDraft(AUTHOR, content("a"), at(2000));
    note.saveEditDraft(AUTHOR, content("ab"), at(3000));
    expect(note.takePendingVersion()).toBeNull();
    expect(note.snapshot.versionCount).toBe(0);
  });

  it("F07: only the author edits, and only after finalization", () => {
    const note = draft();
    const early = note.startEdit(AUTHOR, at(1000));
    expect(!early.ok && early.error.code).toBe("CLINICAL_NOTE_NOT_FINALIZED");
    const other = note.saveDraft("someone-else", content("x"), at(1000));
    expect(!other.ok && other.error.code).toBe("CLINICAL_NOT_AUTHOR");
    note.finalize(AUTHOR, content("Ok."), at(2000));
    const again = note.saveDraft(AUTHOR, content("x"), at(3000));
    expect(!again.ok && again.error.code).toBe("CLINICAL_NOTE_ALREADY_FINALIZED");
    const noEdit = note.saveEditDraft(AUTHOR, content("x"), at(3000));
    expect(!noEdit.ok && noEdit.error.code).toBe("CLINICAL_NO_EDIT_IN_PROGRESS");
  });

  it("F07: a note cannot be finalized empty", () => {
    const note = draft("");
    const result = note.finalize(AUTHOR, content("   "), at(1000));
    expect(!result.ok && result.error.code).toBe("CLINICAL_NOTE_EMPTY");
  });

  it("F07: note length is limited to 50,000 characters of text", () => {
    const ok = ClinicalNote.start({
      id: "n",
      organizationId: "o",
      patientId: "p",
      appointmentId: null,
      professionalId: "pr",
      authorUserId: AUTHOR,
      content: { html: "<p>x</p>", text: "x", characters: NOTE_MAX_CHARACTERS },
      now: NOW,
    });
    expect(ok.ok).toBe(true);
    const note = draft();
    const tooLong = note.saveDraft(
      AUTHOR,
      { html: "<p>x</p>", text: "x", characters: NOTE_MAX_CHARACTERS + 1 },
      at(1),
    );
    expect(!tooLong.ok && tooLong.error.code).toBe("CLINICAL_NOTE_TOO_LONG");
  });

  it("F07: a standalone note has no appointment", () => {
    const started = ClinicalNote.start({
      id: "n",
      organizationId: "o",
      patientId: "p",
      appointmentId: null,
      professionalId: "pr",
      authorUserId: AUTHOR,
      content: content("x"),
      now: NOW,
    });
    expect(started.ok && started.value.snapshot.kind).toBe("STANDALONE");
  });
});

describe("addenda", () => {
  it("F07: addenda are allowed only after the lock and up to 10,000 characters", () => {
    const early = validateAddendum("FINALIZED", 10);
    expect(!early.ok && early.error.code).toBe("CLINICAL_ADDENDUM_BEFORE_LOCK");
    expect(validateAddendum("LOCKED", 10_000).ok).toBe(true);
    const tooLong = validateAddendum("LOCKED", 10_001);
    expect(!tooLong.ok && tooLong.error.code).toBe("CLINICAL_ADDENDUM_TOO_LONG");
    const empty = validateAddendum("LOCKED", 0);
    expect(!empty.ok && empty.error.code).toBe("CLINICAL_ADDENDUM_EMPTY");
  });
});
