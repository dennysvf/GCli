import { authorize } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { addDays } from "@/shared/kernel/calendar-date";
import { fail, ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { zonedTimeToUtc } from "@/shared/kernel/zoned-time";
import { decodeCursor, encodeCursor } from "../domain/cursor";
import { PrivacyErrors } from "../domain/errors";
import { TIMELINE_PAGE_SIZE } from "../domain/limits";
import type { TimelineGroup, TimelineKind } from "../domain/timeline-event";
import { requestedKinds, visibleGroups, type ViewerAccess } from "../domain/visibility";
import type { PrivacyDeps, TimelineItem } from "./ports";
import { timelineNoteSchema, timelineQuerySchema } from "./schemas";

// The patient timeline (PRD F14 Core Scope): one list of the patient's events from five modules,
// newest first, filtered on the server by what the viewer may see.

export type TimelineDeps = Pick<PrivacyDeps, "timeline" | "patients" | "clinical" | "directory" | "clock">;

export type TimelinePage = {
  items: TimelineItem[];
  nextCursor: string | null;
  pageSize: number;
  visibleGroups: TimelineGroup[];
  organizationTimeZone: string;
};

// What the viewer may see (spec decision D3): the clinical rule is F07's records policy, the financial
// one is the billing permission, and a viewer who reads only their own agenda sees only their own
// appointments (F06).
async function viewerAccess(
  deps: TimelineDeps,
  ctx: RequestContext,
  patientId: string,
): Promise<ViewerAccess & { appointments: boolean }> {
  const readsAll = can(ctx, "schedule:read-all");
  const readsOwn = !readsAll && can(ctx, "schedule:read-own") && ctx.linkedProfessionalId !== null;
  return {
    clinical: await deps.clinical.canAccess(ctx, patientId),
    financial: can(ctx, "billing:operate"),
    ownProfessionalId: readsOwn ? ctx.linkedProfessionalId : null,
    appointments: readsAll || readsOwn,
  };
}

function isClinicalItem(item: TimelineItem): boolean {
  if (item.kind === "CLINICAL_NOTE_FINALIZED" || item.kind === "CLINICAL_ADDENDUM_ADDED") return true;
  return (item.kind === "DOCUMENT_UPLOADED" || item.kind === "DOCUMENT_GENERATED") && item.clinical;
}

function rowId(item: TimelineItem): string {
  return item.key.slice(item.key.indexOf(":") + 1);
}

export async function getPatientTimeline(
  deps: TimelineDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<TimelinePage>> {
  const allowed = await authorize(ctx, "patient:read");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(timelineQuerySchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, groups, from, to, cursor: cursorText } = parsed.value;
  if (from && to && to < from) return fail(PrivacyErrors.periodInvalid());
  const cursor = cursorText ? decodeCursor(cursorText) : null;
  if (cursorText && !cursor) return fail(PrivacyErrors.cursorInvalid());

  // The F05 visibility policy: a professional sees only patients with an appointment with them.
  const patient = await deps.patients.patient(ctx, patientId);
  if (!patient.ok) return patient;

  const access = await viewerAccess(deps, ctx, patientId);
  let kinds: TimelineKind[] = requestedKinds(access, groups);
  if (!access.appointments) kinds = kinds.filter((kind) => kind !== "APPOINTMENT");
  const zone = await deps.directory.organizationTimeZone(ctx);
  // The period is a range of local dates in the organization's zone (spec decision D6).
  const window =
    from && to
      ? { from: zonedTimeToUtc(`${from}T00:00`, zone), to: zonedTimeToUtc(`${addDays(to, 1)}T00:00`, zone) }
      : { from: null, to: null };

  const loaded = await withTransaction(ctx, async (uow) => {
    const rows = await deps.timeline.page(uow, {
      organizationId: ctx.organizationId,
      patientId,
      kinds,
      clinicalDocuments: access.clinical,
      ownProfessionalId: access.ownProfessionalId,
      from: window.from,
      to: window.to,
      cursor,
      limit: TIMELINE_PAGE_SIZE + 1,
      organizationTimeZone: zone,
    });
    const items = rows.slice(0, TIMELINE_PAGE_SIZE);
    // Clinical metadata is health data: a page that lists clinical items is one audited read of the
    // patient, as F08 does for clinical documents (spec decision D8).
    const clinical = items.filter(isClinicalItem);
    if (clinical.length > 0) {
      await uow.audit.record({
        action: "READ_SENSITIVE",
        entityType: "patient",
        entityId: patientId,
        summary: "Linha do tempo com itens clínicos consultada",
        metadata: {
          patientId,
          noteIds: clinical.filter((item) => item.kind === "CLINICAL_NOTE_FINALIZED").map(rowId),
          addendumIds: clinical.filter((item) => item.kind === "CLINICAL_ADDENDUM_ADDED").map(rowId),
          documentIds: clinical
            .filter((item) => item.kind === "DOCUMENT_UPLOADED" || item.kind === "DOCUMENT_GENERATED")
            .map(rowId),
        },
      });
    }
    return ok({ items, hasMore: rows.length > TIMELINE_PAGE_SIZE });
  });
  if (!loaded.ok) return loaded;
  const last = loaded.value.items.at(-1);
  return ok({
    items: loaded.value.items,
    nextCursor:
      loaded.value.hasMore && last ? encodeCursor({ at: new Date(last.occurredAt), id: rowId(last) }) : null,
    pageSize: TIMELINE_PAGE_SIZE,
    visibleGroups: visibleGroups(access),
    organizationTimeZone: zone,
  });
}

export type TimelineNote = {
  noteId: string;
  professionalName: string;
  serviceName: string | null;
  finalizedAt: string | null;
  autoFinalized: boolean;
  html: string;
  addenda: { id: string; authorName: string; createdAt: string; html: string }[];
  attachments: { fileName: string; inError: boolean }[];
  timeZone: string;
};

// "Ver registro" (spec decision D4): the full note through the audited read of F07. There is no
// cache, so every expansion is a new audited read.
export async function getTimelineNote(
  deps: TimelineDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<TimelineNote>> {
  const allowed = await authorize(ctx, "clinical:read");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(timelineNoteSchema, input);
  if (!parsed.ok) return parsed;
  const { patientId, noteId } = parsed.value;
  // The note's patient is checked before the read, so a note of another patient is never read (and
  // never audited as read) through this patient's timeline.
  const owner = await withTransaction(ctx, async (uow) =>
    ok(await deps.timeline.notePatientId(uow, ctx.organizationId, noteId)),
  );
  if (!owner.ok) return owner;
  if (owner.value !== patientId) return fail(PrivacyErrors.noteNotFound());
  const note = await deps.clinical.getNote(ctx, noteId);
  if (!note.ok) return note.error.code === "AUTHZ_FORBIDDEN" ? note : fail(PrivacyErrors.noteNotFound());
  const value = note.value;
  return ok({
    noteId: value.id,
    professionalName: value.author.professionalName,
    serviceName: value.appointment?.serviceName ?? null,
    finalizedAt: value.finalizedAt,
    autoFinalized: value.autoFinalized,
    html: value.html,
    addenda: value.addenda,
    attachments: value.attachments.map((item) => ({ fileName: item.fileName, inError: item.inError })),
    timeZone: value.timeZone,
  });
}
