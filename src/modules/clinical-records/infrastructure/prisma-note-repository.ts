import { forTenant } from "@/shared/db/tenant";
import { newId } from "@/shared/kernel/ids";
import type { NoteRepository, SaveOutcome } from "../application/ports";
import { ClinicalNote, type ClinicalNoteProps, type NoteContent } from "../domain/clinical-note";

// Prisma implementation of the note repository. Concurrent edits are caught by the version column,
// and the lock trigger of ADR-032 backs the domain's 24-hour rule.

type NoteRow = {
  id: string;
  organizationId: string;
  patientId: string;
  appointmentId: string | null;
  kind: string;
  professionalId: string;
  authorUserId: string;
  status: string;
  contentHtml: string;
  contentText: string;
  characters: number;
  draftSavedAt: Date;
  locksAt: Date;
  createdAt: Date;
  finalizedAt: Date | null;
  finalizedById: string | null;
  autoFinalized: boolean;
  editDraftHtml: string | null;
  editDraftText: string | null;
  editDraftCharacters: number | null;
  editStartedAt: Date | null;
  version: number;
  _count: { versions: number };
};

function toNote(row: NoteRow): ClinicalNote {
  const editDraft: NoteContent | null =
    row.editDraftHtml !== null
      ? {
          html: row.editDraftHtml,
          text: row.editDraftText ?? "",
          characters: row.editDraftCharacters ?? 0,
        }
      : null;
  const props: ClinicalNoteProps = {
    id: row.id,
    organizationId: row.organizationId,
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    kind: row.kind === "ENCOUNTER" ? "ENCOUNTER" : "STANDALONE",
    professionalId: row.professionalId,
    authorUserId: row.authorUserId,
    status: row.status === "FINALIZED" ? "FINALIZED" : "DRAFT",
    content: { html: row.contentHtml, text: row.contentText, characters: row.characters },
    createdAt: row.createdAt,
    draftSavedAt: row.draftSavedAt,
    locksAt: row.locksAt,
    finalizedAt: row.finalizedAt,
    finalizedById: row.finalizedById,
    autoFinalized: row.autoFinalized,
    editDraft,
    editStartedAt: row.editStartedAt,
    versionCount: row._count.versions,
    version: row.version,
  };
  return ClinicalNote.restore(props);
}

const WITH_COUNT = { _count: { select: { versions: true } } } as const;

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === code;
}

function isLockViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("CLINICAL_NOTE_LOCKED");
}

export const prismaNoteRepository: NoteRepository = {
  async findById(uow, id) {
    const row = await uow.tx.clinicalNote.findFirst({ where: { id }, include: WITH_COUNT });
    return row ? toNote(row) : null;
  },

  async findByAppointment(uow, appointmentId) {
    const row = await uow.tx.clinicalNote.findFirst({ where: { appointmentId }, include: WITH_COUNT });
    return row ? toNote(row) : null;
  },

  async insert(uow, note) {
    const props = note.snapshot;
    try {
      await uow.tx.clinicalNote.create({
        data: {
          id: props.id,
          organizationId: props.organizationId,
          patientId: props.patientId,
          appointmentId: props.appointmentId,
          kind: props.kind,
          professionalId: props.professionalId,
          authorUserId: props.authorUserId,
          status: props.status,
          contentHtml: props.content.html,
          contentText: props.content.text,
          characters: props.content.characters,
          draftSavedAt: props.draftSavedAt,
          createdAt: props.createdAt,
          locksAt: props.locksAt,
        },
      });
      return "OK";
    } catch (error) {
      // The unique index of PRD F07's "one note per appointment".
      if (hasCode(error, "P2002")) return "DUPLICATE";
      throw error;
    }
  },

  async save(uow, note, expectedVersion): Promise<SaveOutcome> {
    const props = note.snapshot;
    const pending = note.takePendingVersion();
    try {
      const updated = await uow.tx.clinicalNote.updateMany({
        where: { id: props.id, version: expectedVersion },
        data: {
          status: props.status,
          contentHtml: props.content.html,
          contentText: props.content.text,
          characters: props.content.characters,
          draftSavedAt: props.draftSavedAt,
          finalizedAt: props.finalizedAt,
          finalizedById: props.finalizedById,
          autoFinalized: props.autoFinalized,
          editDraftHtml: props.editDraft?.html ?? null,
          editDraftText: props.editDraft?.text ?? null,
          editDraftCharacters: props.editDraft?.characters ?? null,
          editStartedAt: props.editStartedAt,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) return "STALE";
      if (pending) {
        await uow.tx.clinicalNoteVersion.create({
          data: {
            id: newId(),
            organizationId: props.organizationId,
            noteId: props.id,
            versionNumber: pending.versionNumber,
            contentHtml: pending.content.html,
            contentText: pending.content.text,
            characters: pending.content.characters,
            replacedById: pending.replacedById,
          },
        });
      }
      return "OK";
    } catch (error) {
      if (isLockViolation(error)) return "LOCKED";
      throw error;
    }
  },

  async lock(uow, noteId, organizationId) {
    await uow.tx.$queryRaw`
      SELECT id FROM clinical_note
      WHERE id = ${noteId}::uuid AND organization_id = ${organizationId}::uuid
      FOR UPDATE`;
  },

  async listVisible(uow, query) {
    const where = {
      patientId: query.patientId,
      OR: [{ status: "FINALIZED" }, { locksAt: { lte: query.now } }, { authorUserId: query.viewerUserId }],
    };
    const [rows, total] = await Promise.all([
      uow.tx.clinicalNote.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: query.skip,
        take: query.take,
        select: {
          id: true,
          kind: true,
          appointmentId: true,
          professionalId: true,
          authorUserId: true,
          status: true,
          autoFinalized: true,
          contentText: true,
          createdAt: true,
          locksAt: true,
          _count: { select: { addenda: true } },
        },
      }),
      uow.tx.clinicalNote.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((row) => ({
        id: row.id,
        kind: row.kind === "ENCOUNTER" ? "ENCOUNTER" : "STANDALONE",
        appointmentId: row.appointmentId,
        professionalId: row.professionalId,
        authorUserId: row.authorUserId,
        status: row.status === "FINALIZED" ? "FINALIZED" : "DRAFT",
        autoFinalized: row.autoFinalized,
        previewText: row.contentText.slice(0, 600),
        createdAt: row.createdAt,
        locksAt: row.locksAt,
        addendaCount: row._count.addenda,
      })),
    };
  },

  // Called by scheduling outside a unit of work, so it opens its own tenant-scoped client.
  async statesForAppointments(organizationId, appointmentIds, viewerUserId, now) {
    const rows = await forTenant(organizationId).clinicalNote.findMany({
      where: { appointmentId: { in: appointmentIds } },
      select: { appointmentId: true, status: true, locksAt: true, authorUserId: true },
    });
    const states = new Map<string, "DRAFT" | "FINALIZED">();
    for (const row of rows) {
      if (!row.appointmentId) continue;
      if (row.status === "FINALIZED" || row.locksAt.getTime() <= now.getTime()) {
        states.set(row.appointmentId, "FINALIZED");
      } else if (row.authorUserId === viewerUserId) {
        states.set(row.appointmentId, "DRAFT");
      }
    }
    return states;
  },

  async addenda(uow, noteId) {
    const rows = await uow.tx.clinicalNoteAddendum.findMany({
      where: { noteId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      authorUserId: row.authorUserId,
      professionalId: row.professionalId,
      contentHtml: row.contentHtml,
      characters: row.characters,
      createdAt: row.createdAt,
    }));
  },

  async insertAddendum(uow, addendum, actor) {
    await uow.tx.clinicalNoteAddendum.create({ data: { ...addendum, organizationId: actor.organizationId } });
  },

  async versions(uow, noteId) {
    const rows = await uow.tx.clinicalNoteVersion.findMany({
      where: { noteId },
      orderBy: { versionNumber: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      versionNumber: row.versionNumber,
      contentHtml: row.contentHtml,
      characters: row.characters,
      replacedAt: row.replacedAt,
      replacedById: row.replacedById,
    }));
  },

  async findVersion(uow, versionId) {
    const row = await uow.tx.clinicalNoteVersion.findFirst({ where: { id: versionId } });
    return row
      ? {
          id: row.id,
          noteId: row.noteId,
          versionNumber: row.versionNumber,
          contentHtml: row.contentHtml,
          characters: row.characters,
          replacedAt: row.replacedAt,
          replacedById: row.replacedById,
        }
      : null;
  },
};
