import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { IN_ERROR_WINDOW_MS, LIST_PAGE_SIZE, PREVIEW_CHARACTERS } from "../domain/limits";
import type { ClinicalNote, NoteState } from "../domain/clinical-note";
import { canStartEncounterNote, canStartStandaloneNote } from "../domain/eligibility";
import { ClinicalErrors } from "../domain/errors";
import { loadAccessibleNote } from "./access";
import { requirePatientAccess } from "./policies";
import type { AttachmentRow, ClinicalRecordsDeps, NoteListRow } from "./ports";
import { pageSchema, recordQuerySchema } from "./schemas";

// Read side of the clinical records (PRD F07 Experience). Every read passes the records policy and
// writes an audit entry: opening a note, its versions, an attachment, or the list of previews.

export type NoteListItem = {
  id: string;
  kind: "ENCOUNTER" | "STANDALONE";
  // Appointment start for encounter notes, creation for standalone ones.
  date: string;
  timeZone: string;
  professionalName: string;
  serviceName: string | null;
  preview: string;
  state: NoteState;
  autoFinalized: boolean;
  addendaCount: number;
  isOwnDraft: boolean;
};

export type NoteListPage = { items: NoteListItem[]; page: number; pageSize: number; total: number };

export type AttachmentItem = {
  id: string;
  fileName: string;
  contentType: string;
  status: AttachmentRow["status"];
  size: number;
  thumbnailUrl: string | null;
  inError: boolean;
  createdAt: string;
  canMarkInError: boolean;
};

export type NoteDetails = {
  id: string;
  kind: "ENCOUNTER" | "STANDALONE";
  patientId: string;
  appointment: { id: string; startsAt: string; serviceName: string; unitTimeZone: string } | null;
  timeZone: string;
  author: { userId: string; professionalName: string };
  isAuthor: boolean;
  state: NoteState;
  autoFinalized: boolean;
  html: string;
  characters: number;
  // Only the author sees the pending edit.
  editDraft: { html: string; characters: number } | null;
  createdAt: string;
  draftSavedAt: string;
  finalizedAt: string | null;
  locksAt: string;
  versionCount: number;
  addenda: { id: string; authorName: string; createdAt: string; html: string }[];
  attachments: AttachmentItem[];
  version: number;
};

export type RecordCurrent =
  | { kind: "NOTE"; note: NoteDetails }
  | {
      kind: "NEW";
      appointment: { id: string; startsAt: string; serviceName: string; unitTimeZone: string };
    }
  | { kind: "NEW_STANDALONE" }
  // Nothing can be opened or started for the request; the code explains why.
  | { kind: "NONE"; reason: string | null };

export type ClinicalRecord = {
  header: {
    patientId: string;
    displayName: string;
    age: number | null;
    alert: { text: string; version: number };
  };
  notes: NoteListPage;
  current: RecordCurrent;
  permissions: { canWrite: boolean; canAddStandalone: boolean };
  timeZone: string;
};

async function toListItems(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  rows: NoteListRow[],
  now: Date,
  organizationZone: string,
): Promise<NoteListItem[]> {
  const appointments = await deps.directory.appointments(
    ctx.organizationId,
    rows.flatMap((row) => (row.appointmentId ? [row.appointmentId] : [])),
  );
  const names = await deps.directory.professionalNames(ctx, [
    ...new Set(rows.map((row) => row.professionalId)),
  ]);
  return rows.map((row) => {
    const appointment = row.appointmentId ? appointments.get(row.appointmentId) : undefined;
    const locked = now.getTime() >= row.locksAt.getTime();
    const state: NoteState = locked ? "LOCKED" : row.status;
    return {
      id: row.id,
      kind: row.kind,
      date: (appointment ? new Date(appointment.startsAt) : row.createdAt).toISOString(),
      timeZone: appointment?.unitTimeZone ?? organizationZone,
      professionalName: names.get(row.professionalId) ?? "",
      serviceName: appointment?.serviceName ?? null,
      preview: Array.from(row.previewText).slice(0, PREVIEW_CHARACTERS).join(""),
      state,
      autoFinalized: row.autoFinalized,
      addendaCount: row.addendaCount,
      isOwnDraft: row.status === "DRAFT" && row.authorUserId === ctx.user.id && !locked,
    };
  });
}

async function listPage(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  uow: UnitOfWork,
  patientId: string,
  page: number,
  now: Date,
): Promise<{ rows: NoteListRow[]; total: number }> {
  return deps.notes.listVisible(uow, {
    patientId,
    viewerUserId: ctx.user.id,
    now,
    skip: (page - 1) * LIST_PAGE_SIZE,
    take: LIST_PAGE_SIZE,
  });
}

// The previews of the patient's notes (record page, patient tab). The list is one audited read.
export async function listPatientNotes(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<NoteListPage>> {
  const parsed = parseInput(pageSchema, input);
  if (!parsed.ok) return parsed;
  const access = await requirePatientAccess(deps, ctx, parsed.value.patientId);
  if (!access.ok) return access;
  const now = deps.clock();
  const zone = await deps.directory.organizationTimeZone(ctx);
  const listed = await withTransaction(ctx, async (uow) => {
    const result = await listPage(deps, ctx, uow, parsed.value.patientId, parsed.value.page, now);
    await uow.audit.record({
      action: "READ_SENSITIVE",
      entityType: "patient",
      entityId: parsed.value.patientId,
      summary: "Lista de registros clínicos aberta",
      metadata: { noteIds: result.rows.map((row) => row.id) },
    });
    return ok(result);
  });
  if (!listed.ok) return listed;
  return ok({
    items: await toListItems(deps, ctx, listed.value.rows, now, zone),
    page: parsed.value.page,
    pageSize: LIST_PAGE_SIZE,
    total: listed.value.total,
  });
}

async function buildDetails(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  note: ClinicalNote,
  now: Date,
): Promise<Result<NoteDetails>> {
  const props = note.snapshot;
  const loaded = await withTransaction(ctx, async (uow) => {
    const [addenda, attachments] = await Promise.all([
      deps.notes.addenda(uow, props.id),
      deps.attachments.list(uow, props.id),
    ]);
    await uow.audit.record({
      action: "READ_SENSITIVE",
      entityType: "clinical_note",
      entityId: props.id,
      summary: "Registro clínico aberto",
      metadata: { patientId: props.patientId },
    });
    return ok({ addenda, attachments });
  });
  if (!loaded.ok) return loaded;
  const { addenda, attachments } = loaded.value;

  const appointment = props.appointmentId
    ? ((await deps.directory.appointments(ctx.organizationId, [props.appointmentId])).get(
        props.appointmentId,
      ) ?? null)
    : null;
  const zone = appointment?.unitTimeZone ?? (await deps.directory.organizationTimeZone(ctx));
  const [professionals, users] = await Promise.all([
    deps.directory.professionalNames(ctx, [props.professionalId]),
    deps.directory.userNames(
      ctx,
      addenda.map((row) => row.authorUserId),
    ),
  ]);
  const isAuthor = note.isAuthor(ctx.user.id);
  // Thumbnails are covered by this audited read: their URLs expire in 5 minutes like any other.
  const items = await Promise.all(
    attachments.map(async (row): Promise<AttachmentItem> => {
      const thumbnailUrl =
        row.status === "READY" && row.thumbnailKey
          ? await deps.storage.presignDownload(row.thumbnailKey)
          : null;
      return {
        id: row.id,
        fileName: row.fileName,
        contentType: row.contentType ?? row.sourceContentType,
        status: row.status,
        size: row.sizeBytes,
        thumbnailUrl,
        inError: row.markedInErrorAt !== null,
        createdAt: row.createdAt.toISOString(),
        canMarkInError:
          row.uploadedById === ctx.user.id &&
          row.markedInErrorAt === null &&
          now.getTime() - row.createdAt.getTime() < IN_ERROR_WINDOW_MS,
      };
    }),
  );
  return ok({
    id: props.id,
    kind: props.kind,
    patientId: props.patientId,
    appointment:
      appointment && props.appointmentId
        ? {
            id: props.appointmentId,
            startsAt: appointment.startsAt,
            serviceName: appointment.serviceName,
            unitTimeZone: appointment.unitTimeZone,
          }
        : null,
    timeZone: zone,
    author: { userId: props.authorUserId, professionalName: professionals.get(props.professionalId) ?? "" },
    isAuthor,
    state: note.effectiveState(now),
    autoFinalized: props.autoFinalized,
    // Sanitized again on the way out: the allowlist may have changed since the note was written.
    html: deps.sanitizer.sanitize(props.content.html).html,
    characters: props.content.characters,
    editDraft:
      isAuthor && props.editDraft
        ? { html: deps.sanitizer.sanitize(props.editDraft.html).html, characters: props.editDraft.characters }
        : null,
    createdAt: props.createdAt.toISOString(),
    draftSavedAt: props.draftSavedAt.toISOString(),
    finalizedAt: props.finalizedAt?.toISOString() ?? null,
    locksAt: props.locksAt.toISOString(),
    versionCount: props.versionCount,
    addenda: addenda.map((row) => ({
      id: row.id,
      authorName: users.get(row.authorUserId) ?? "",
      createdAt: row.createdAt.toISOString(),
      html: deps.sanitizer.sanitize(row.contentHtml).html,
    })),
    attachments: items,
    version: props.version,
  });
}

// Opens one note with its addenda and attachments (audited).
export async function getNote(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  noteId: string,
): Promise<Result<NoteDetails>> {
  const loaded = await loadAccessibleNote(deps, ctx, noteId);
  if (!loaded.ok) return loaded;
  return buildDetails(deps, ctx, loaded.value, deps.clock());
}

// What the record page shows when the request carries an appointment: its note, or the chance to
// start one, or the reason that is not possible.
async function resolveAppointment(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  patientId: string,
  appointmentId: string,
  now: Date,
): Promise<RecordCurrent> {
  const appointment = await deps.directory.appointment(ctx.organizationId, appointmentId);
  if (!appointment || appointment.patientId !== patientId) return { kind: "NONE", reason: null };
  const existing = await withTransaction(ctx, async (uow) =>
    ok(await deps.notes.findByAppointment(uow, appointmentId)),
  );
  if (existing.ok && existing.value) {
    const note = existing.value;
    if (note.isAuthor(ctx.user.id) || note.isVisibleToOthers(now)) {
      const details = await buildDetails(deps, ctx, note, now);
      return details.ok
        ? { kind: "NOTE", note: details.value }
        : { kind: "NONE", reason: details.error.code };
    }
    return { kind: "NONE", reason: null };
  }
  const eligible = canStartEncounterNote({
    appointmentStatus: appointment.status,
    appointmentProfessionalId: appointment.professionalId,
    actorProfessionalId: can(ctx, "clinical:write") ? ctx.linkedProfessionalId : null,
  });
  if (!eligible.ok) return { kind: "NONE", reason: eligible.error.code };
  return {
    kind: "NEW",
    appointment: {
      id: appointment.id,
      startsAt: appointment.startsAt,
      serviceName: appointment.serviceName,
      unitTimeZone: appointment.unitTimeZone,
    },
  };
}

// The record page: patient header with the clinical alert, the first page of previews, and the
// note on the right (PRD F07 Experience). The list is audited as one patient read, and an opened
// note as a note read.
export async function getClinicalRecord(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<ClinicalRecord>> {
  const parsed = parseInput(recordQuerySchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, appointmentId, noteId, standalone } = parsed.value;
  const access = await requirePatientAccess(deps, ctx, patientId);
  if (!access.ok) return access;
  const now = deps.clock();
  const patient = await deps.directory.patient(ctx, patientId);
  if (!patient) return fail(ClinicalErrors.noteNotFound());
  const zone = await deps.directory.organizationTimeZone(ctx);

  const loaded = await withTransaction(ctx, async (uow) => {
    const [alert, list] = await Promise.all([
      deps.alerts.find(uow, patientId),
      listPage(deps, ctx, uow, patientId, 1, now),
    ]);
    await uow.audit.record({
      action: "READ_SENSITIVE",
      entityType: "patient",
      entityId: patientId,
      summary: "Prontuário aberto",
      metadata: { noteIds: list.rows.map((row) => row.id) },
    });
    return ok({ alert, list });
  });
  if (!loaded.ok) return loaded;

  const canWrite = can(ctx, "clinical:write") && ctx.linkedProfessionalId !== null;
  const relation = ctx.linkedProfessionalId
    ? await deps.directory.relation(ctx.organizationId, ctx.linkedProfessionalId, patientId, now)
    : { hasAnyAppointment: false, hasAttendedPastAppointment: false };
  const canAddStandalone = canWrite && canStartStandaloneNote(relation.hasAttendedPastAppointment).ok;

  let current: RecordCurrent = { kind: "NONE", reason: null };
  if (noteId) {
    const note = await loadAccessibleNote(deps, ctx, noteId);
    if (note.ok && note.value.snapshot.patientId === patientId) {
      const details = await buildDetails(deps, ctx, note.value, now);
      if (details.ok) current = { kind: "NOTE", note: details.value };
    }
  } else if (appointmentId) {
    current = await resolveAppointment(deps, ctx, patientId, appointmentId, now);
  } else if (standalone) {
    const eligible = canWrite ? canStartStandaloneNote(relation.hasAttendedPastAppointment) : null;
    current =
      eligible?.ok === true
        ? { kind: "NEW_STANDALONE" }
        : { kind: "NONE", reason: eligible && !eligible.ok ? eligible.error.code : null };
  }

  return ok({
    header: {
      patientId,
      displayName: patient.displayName,
      age: patient.age,
      alert: { text: loaded.value.alert?.text ?? "", version: loaded.value.alert?.version ?? 0 },
    },
    notes: {
      items: await toListItems(deps, ctx, loaded.value.list.rows, now, zone),
      page: 1,
      pageSize: LIST_PAGE_SIZE,
      total: loaded.value.list.total,
    },
    current,
    permissions: { canWrite, canAddStandalone },
    timeZone: zone,
  });
}

export type VersionItem = {
  id: string;
  versionNumber: number;
  replacedAt: string;
  replacedByName: string;
  characters: number;
};

// "Versões anteriores": the contents that edits replaced within the 24 hours.
export async function listVersions(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  noteId: string,
): Promise<Result<VersionItem[]>> {
  const loaded = await loadAccessibleNote(deps, ctx, noteId);
  if (!loaded.ok) return loaded;
  const rows = await withTransaction(ctx, async (uow) => ok(await deps.notes.versions(uow, noteId)));
  if (!rows.ok) return rows;
  const names = await deps.directory.userNames(
    ctx,
    rows.value.map((row) => row.replacedById),
  );
  return ok(
    rows.value.map((row) => ({
      id: row.id,
      versionNumber: row.versionNumber,
      replacedAt: row.replacedAt.toISOString(),
      replacedByName: names.get(row.replacedById) ?? "",
      characters: row.characters,
    })),
  );
}

// Opening a version is a clinical read like any other, so it is audited.
export async function getVersion(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  versionId: string,
): Promise<Result<{ id: string; versionNumber: number; html: string; replacedAt: string }>> {
  const found = await withTransaction(ctx, async (uow) => ok(await deps.notes.findVersion(uow, versionId)));
  if (!found.ok) return found;
  if (!found.value) return fail(ClinicalErrors.noteNotFound());
  const version = found.value;
  const loaded = await loadAccessibleNote(deps, ctx, version.noteId);
  if (!loaded.ok) return loaded;
  const audited = await withTransaction(ctx, async (uow) => {
    await uow.audit.record({
      action: "READ_SENSITIVE",
      entityType: "clinical_note_version",
      entityId: version.id,
      summary: "Versão anterior do registro clínico aberta",
      metadata: { noteId: version.noteId },
    });
    return ok(undefined);
  });
  if (!audited.ok) return audited;
  return ok({
    id: version.id,
    versionNumber: version.versionNumber,
    html: deps.sanitizer.sanitize(version.contentHtml).html,
    replacedAt: version.replacedAt.toISOString(),
  });
}
