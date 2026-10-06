import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { ClinicalNote, type NoteContent } from "../domain/clinical-note";
import { canStartEncounterNote, canStartStandaloneNote } from "../domain/eligibility";
import { ClinicalErrors } from "../domain/errors";
import { clinicalEvent, CLINICAL_RECORDS_EVENTS } from "../domain/events";
import { AUTOSAVE_AUDIT_INTERVAL_MS } from "../domain/limits";
import { requireWriter } from "./policies";
import type { Actor, ClinicalRecordsDeps } from "./ports";
import { noteContentSchema, noteVersionSchema, saveDraftSchema } from "./schemas";
import { buildContent, contentChange, isLockViolation, lockedError, withLockDetails } from "./support";

// Write side of the clinical notes (PRD F07 Capabilities): drafts with autosave, finalization,
// edits within the 24 hours with versions. Every use case authorizes first, writes the audit entry
// in the same transaction (lengths only, never text) and publishes its event.

export type SaveResult = {
  noteId: string;
  version: number;
  savedAt: string;
  locksAt: string;
  characters: number;
};

export type FinalizeResult = {
  status: "FINALIZED";
  finalizedAt: string;
  locksAt: string;
  version: number;
};

export type EditResult = { version: number; editing: boolean; locksAt: string };

function actorOf(ctx: RequestContext): Actor {
  return { userId: ctx.user.id, organizationId: ctx.organizationId };
}

function eventPayload(note: ClinicalNote, actorUserId: string | null) {
  const props = note.snapshot;
  return {
    noteId: props.id,
    patientId: props.patientId,
    appointmentId: props.appointmentId,
    professionalId: props.professionalId,
    actorUserId,
  };
}

// Autosaves land every ten seconds; the audit log gets at most one entry per minute for them.
function crossesAuditMinute(previous: Date, now: Date): boolean {
  return (
    Math.floor(previous.getTime() / AUTOSAVE_AUDIT_INTERVAL_MS) !==
    Math.floor(now.getTime() / AUTOSAVE_AUDIT_INTERVAL_MS)
  );
}

// A database lock violation (the trigger of ADR-032) becomes the same error as the domain check.
async function guarded<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (error) {
    if (isLockViolation(error)) return fail(ClinicalErrors.noteLocked());
    throw error;
  }
}

async function loadOwn(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  uow: UnitOfWork,
  noteId: string,
  version: number,
): Promise<Result<ClinicalNote>> {
  const note = await deps.notes.findById(uow, noteId);
  if (!note) return fail(ClinicalErrors.noteNotFound());
  if (!note.isAuthor(ctx.user.id)) return fail(ClinicalErrors.notAuthor());
  if (note.snapshot.version !== version) return fail(ClinicalErrors.noteStale());
  return ok(note);
}

async function persist(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  uow: UnitOfWork,
  note: ClinicalNote,
  expectedVersion: number,
): Promise<Result<void>> {
  const outcome = await deps.notes.save(uow, note, expectedVersion, actorOf(ctx));
  if (outcome === "STALE") return fail(ClinicalErrors.noteStale());
  if (outcome === "LOCKED") return fail(await lockedError(deps, ctx, note));
  return ok(undefined);
}

function saveResult(note: ClinicalNote, version: number, characters: number, now: Date): SaveResult {
  return {
    noteId: note.snapshot.id,
    version,
    savedAt: now.toISOString(),
    locksAt: note.snapshot.locksAt.toISOString(),
    characters,
  };
}

// First save of an encounter or standalone note: validates who may start it, then creates the
// draft and starts the 24-hour clock (spec F07 section 3).
async function startNote(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  professionalId: string,
  input: { appointmentId?: string; patientId?: string },
  content: NoteContent,
): Promise<Result<SaveResult>> {
  const now = deps.clock();
  if (content.text.trim().length === 0) return fail(ClinicalErrors.noteEmpty());
  let patientId: string;
  let appointmentId: string | null = null;
  if (input.appointmentId) {
    const appointment = await deps.directory.appointment(ctx.organizationId, input.appointmentId);
    if (!appointment) return fail(ClinicalErrors.noteNotFound());
    const eligible = canStartEncounterNote({
      appointmentStatus: appointment.status,
      appointmentProfessionalId: appointment.professionalId,
      actorProfessionalId: professionalId,
    });
    if (!eligible.ok) return eligible;
    patientId = appointment.patientId;
    appointmentId = appointment.id;
  } else if (input.patientId) {
    const relation = await deps.directory.relation(ctx.organizationId, professionalId, input.patientId, now);
    const eligible = canStartStandaloneNote(relation.hasAttendedPastAppointment);
    if (!eligible.ok) return eligible;
    patientId = input.patientId;
  } else {
    return fail(CommonErrors.validationFailed({ noteId: "clinicalRecords.validation.invalid" }));
  }

  const started = ClinicalNote.start({
    id: newId(),
    organizationId: ctx.organizationId,
    patientId,
    appointmentId,
    professionalId,
    authorUserId: ctx.user.id,
    content,
    now,
  });
  if (!started.ok) return started;
  const note = started.value;
  return withTransaction(ctx, async (uow) => {
    if (appointmentId && (await deps.notes.findByAppointment(uow, appointmentId))) {
      return fail(ClinicalErrors.noteStale());
    }
    const inserted = await deps.notes.insert(uow, note, actorOf(ctx));
    // Two tabs saving the first draft of the same appointment: the unique index decides.
    if (inserted === "DUPLICATE") return fail(ClinicalErrors.noteStale());
    await uow.audit.record({
      action: "CREATE",
      entityType: "clinical_note",
      entityId: note.snapshot.id,
      summary: "Registro clínico iniciado",
      changes: { content: contentChange(0, content.characters) },
      metadata: { kind: note.snapshot.kind, appointmentId },
    });
    return ok(saveResult(note, 1, content.characters, now));
  });
}

// Autosave and first save of a draft (PRD F07: every 10 seconds and on blur).
export async function saveDraft(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SaveResult>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(saveDraftSchema, input);
  if (!parsed.ok) return parsed;
  const content = buildContent(deps, parsed.value.html);
  if (!content.ok) return content;
  const { noteId, version } = parsed.value;
  if (!noteId || version === undefined) {
    return guarded(() => startNote(deps, ctx, writer.value.professionalId, parsed.value, content.value));
  }
  const now = deps.clock();
  return guarded(() =>
    withTransaction(ctx, async (uow) => {
      const loaded = await loadOwn(deps, ctx, uow, noteId, version);
      if (!loaded.ok) return loaded;
      const note = loaded.value;
      const previous = note.snapshot;
      const saved = await withLockDetails(deps, ctx, note, note.saveDraft(ctx.user.id, content.value, now));
      if (!saved.ok) return saved;
      const persisted = await persist(deps, ctx, uow, note, version);
      if (!persisted.ok) return persisted;
      if (crossesAuditMinute(previous.draftSavedAt, now)) {
        await uow.audit.record({
          action: "UPDATE",
          entityType: "clinical_note",
          entityId: noteId,
          summary: "Rascunho do registro clínico salvo",
          changes: { content: contentChange(previous.content.characters, content.value.characters) },
        });
      }
      return ok(saveResult(note, version + 1, content.value.characters, now));
    }),
  );
}

// "Finalizar registro": saves the final content and makes the note visible to colleagues.
export async function finalizeNote(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<FinalizeResult>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(noteContentSchema, input);
  if (!parsed.ok) return parsed;
  const content = buildContent(deps, parsed.value.html);
  if (!content.ok) return content;
  const { noteId, version } = parsed.value;
  const now = deps.clock();
  return guarded(() =>
    withTransaction(ctx, async (uow) => {
      const loaded = await loadOwn(deps, ctx, uow, noteId, version);
      if (!loaded.ok) return loaded;
      const note = loaded.value;
      const before = note.snapshot.content.characters;
      const finalized = await withLockDetails(
        deps,
        ctx,
        note,
        note.finalize(ctx.user.id, content.value, now),
      );
      if (!finalized.ok) return finalized;
      const persisted = await persist(deps, ctx, uow, note, version);
      if (!persisted.ok) return persisted;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "clinical_note",
        entityId: noteId,
        summary: "Registro clínico finalizado",
        changes: {
          status: { before: "DRAFT", after: "FINALIZED" },
          content: contentChange(before, content.value.characters),
        },
      });
      await uow.publish(
        clinicalEvent(
          CLINICAL_RECORDS_EVENTS.noteFinalized,
          { ...eventPayload(note, ctx.user.id), automatic: false },
          now,
        ),
      );
      return ok({
        status: "FINALIZED" as const,
        finalizedAt: now.toISOString(),
        locksAt: note.snapshot.locksAt.toISOString(),
        version: version + 1,
      });
    }),
  );
}

// "Editar": opens the edit draft of a finalized note (idempotent).
export async function startEdit(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<EditResult>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(noteVersionSchema, input);
  if (!parsed.ok) return parsed;
  const { noteId, version } = parsed.value;
  const now = deps.clock();
  return guarded(() =>
    withTransaction(ctx, async (uow) => {
      const loaded = await loadOwn(deps, ctx, uow, noteId, version);
      if (!loaded.ok) return loaded;
      const note = loaded.value;
      const hadDraft = note.snapshot.editDraft !== null;
      const started = await withLockDetails(deps, ctx, note, note.startEdit(ctx.user.id, now));
      if (!started.ok) return started;
      if (hadDraft) {
        return ok({ version, editing: true, locksAt: note.snapshot.locksAt.toISOString() });
      }
      const persisted = await persist(deps, ctx, uow, note, version);
      if (!persisted.ok) return persisted;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "clinical_note",
        entityId: noteId,
        summary: "Edição do registro clínico iniciada",
        metadata: { editStarted: true },
      });
      return ok({ version: version + 1, editing: true, locksAt: note.snapshot.locksAt.toISOString() });
    }),
  );
}

// Autosave of the edit draft: colleagues keep seeing the published content.
export async function saveEditDraft(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<SaveResult>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(noteContentSchema, input);
  if (!parsed.ok) return parsed;
  const content = buildContent(deps, parsed.value.html);
  if (!content.ok) return content;
  const { noteId, version } = parsed.value;
  const now = deps.clock();
  return guarded(() =>
    withTransaction(ctx, async (uow) => {
      const loaded = await loadOwn(deps, ctx, uow, noteId, version);
      if (!loaded.ok) return loaded;
      const note = loaded.value;
      const previous = note.snapshot;
      const saved = await withLockDetails(
        deps,
        ctx,
        note,
        note.saveEditDraft(ctx.user.id, content.value, now),
      );
      if (!saved.ok) return saved;
      const persisted = await persist(deps, ctx, uow, note, version);
      if (!persisted.ok) return persisted;
      if (crossesAuditMinute(previous.draftSavedAt, now)) {
        await uow.audit.record({
          action: "UPDATE",
          entityType: "clinical_note",
          entityId: noteId,
          summary: "Rascunho de edição do registro clínico salvo",
          changes: {
            editDraft: contentChange(previous.editDraft?.characters ?? 0, content.value.characters),
          },
        });
      }
      return ok(saveResult(note, version + 1, content.value.characters, now));
    }),
  );
}

export type PublishResult = { version: number; versionNumber: number; publishedAt: string };

// "Salvar alterações": the replaced content is stored as a version (PRD F07).
export async function publishEdit(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<PublishResult>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(noteContentSchema, input);
  if (!parsed.ok) return parsed;
  const content = buildContent(deps, parsed.value.html);
  if (!content.ok) return content;
  const { noteId, version } = parsed.value;
  const now = deps.clock();
  return guarded(() =>
    withTransaction(ctx, async (uow) => {
      const loaded = await loadOwn(deps, ctx, uow, noteId, version);
      if (!loaded.ok) return loaded;
      const note = loaded.value;
      const before = note.snapshot.content.characters;
      const published = await withLockDetails(
        deps,
        ctx,
        note,
        note.publishEdit(ctx.user.id, content.value, now),
      );
      if (!published.ok) return published;
      const persisted = await persist(deps, ctx, uow, note, version);
      if (!persisted.ok) return persisted;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "clinical_note",
        entityId: noteId,
        summary: "Registro clínico editado",
        changes: { content: contentChange(before, content.value.characters) },
        metadata: { versionNumber: published.value.versionNumber },
      });
      await uow.publish(
        clinicalEvent(CLINICAL_RECORDS_EVENTS.noteEdited, eventPayload(note, ctx.user.id), now),
      );
      return ok({
        version: version + 1,
        versionNumber: published.value.versionNumber,
        publishedAt: now.toISOString(),
      });
    }),
  );
}

// "Descartar alterações".
export async function discardEdit(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ version: number }>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(noteVersionSchema, input);
  if (!parsed.ok) return parsed;
  const { noteId, version } = parsed.value;
  const now = deps.clock();
  return guarded(() =>
    withTransaction(ctx, async (uow) => {
      const loaded = await loadOwn(deps, ctx, uow, noteId, version);
      if (!loaded.ok) return loaded;
      const note = loaded.value;
      const discarded = await withLockDetails(deps, ctx, note, note.discardEdit(ctx.user.id, now));
      if (!discarded.ok) return discarded;
      const persisted = await persist(deps, ctx, uow, note, version);
      if (!persisted.ok) return persisted;
      await uow.audit.record({
        action: "UPDATE",
        entityType: "clinical_note",
        entityId: noteId,
        summary: "Edição do registro clínico descartada",
        metadata: { editDiscarded: true },
      });
      return ok({ version: version + 1 });
    }),
  );
}
