"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/shared/ui/components/alert";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { AttachmentItem, NoteDetails, RecordCurrent } from "../application/queries";
import { AttachmentsArea } from "./attachments-area";
import { NoteEditorPanel, type NewNoteTarget } from "./note-editor-panel";
import { NoteReader } from "./note-reader";
import type { RecordActions } from "./record-actions";

// The right column of the record page: the note being written or read (PRD F07 Experience).
export function NoteWorkspace({
  current,
  patientId,
  userId,
  timeZone,
  canWrite,
  actions,
  onCreated,
  onListChanged,
}: {
  current: RecordCurrent;
  patientId: string;
  userId: string;
  timeZone: string;
  canWrite: boolean;
  actions: RecordActions;
  // A first save created the note: the page highlights it and refreshes the list.
  onCreated: (noteId: string) => void;
  onListChanged: () => void;
}) {
  const t = useTranslations();
  const format = useFormatters();
  const [note, setNote] = useState<NoteDetails | null>(current.kind === "NOTE" ? current.note : null);
  // Bumped after a reload, so the editor or reader below starts fresh with the new data.
  const [revision, setRevision] = useState(0);

  // A note created by the first save of this editor, and its attachments while the editor stays mounted.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [liveAttachments, setLiveAttachments] = useState<AttachmentItem[]>([]);

  // remount = false refreshes the note around an editor that must keep its unsaved text (after an
  // attachment changed); true starts the editor or reader fresh (after finalizing, publishing...).
  const reload = useCallback(
    async (noteId: string, remount = true) => {
      const result = await actions.openNote({ noteId });
      if (handleActionResult(result)) {
        setNote(result.data);
        if (remount) setRevision((value) => value + 1);
        onListChanged();
      }
    },
    [actions, onListChanged],
  );

  const refreshAttachments = useCallback(
    async (noteId: string) => {
      const result = await actions.openNote({ noteId });
      if (handleActionResult(result)) setLiveAttachments(result.data.attachments);
    },
    [actions],
  );

  if (current.kind === "NONE") {
    return (
      <Alert variant="info">
        {current.reason
          ? t(`clinicalRecords.errors.${current.reason}`)
          : t("clinicalRecords.ui.nothingSelected")}
      </Alert>
    );
  }

  if (note) {
    const heading = note.appointment
      ? t("clinicalRecords.ui.encounterOf", {
          service: note.appointment.serviceName,
          date: format.date(note.appointment.startsAt, note.timeZone),
          time: format.time(note.appointment.startsAt, note.timeZone),
        })
      : t("clinicalRecords.ui.standalone");
    return (
      <div className="grid gap-4">
        <div className="grid gap-0.5">
          <h2 className="section-title">{heading}</h2>
          <p className="text-muted-foreground text-xs">{note.author.professionalName}</p>
        </div>
        {note.isAuthor && note.state === "DRAFT" ? (
          <>
            <NoteEditorPanel
              key={`${note.id}-${revision}`}
              mode="draft"
              note={note}
              target={null}
              initialHtml={note.html}
              userId={userId}
              timeZone={timeZone}
              actions={actions}
              onCreated={onCreated}
              onChanged={(noteId) => void reload(noteId)}
            />
            <div className="border-t pt-4">
              <AttachmentsArea
                noteId={note.id}
                attachments={note.attachments}
                canAdd
                actions={{ confirm: actions.confirmAttachment, markInError: actions.markAttachmentInError }}
                onChanged={() => void reload(note.id, false)}
              />
            </div>
          </>
        ) : note.isAuthor && note.state === "FINALIZED" && note.editDraft ? (
          <>
            <NoteEditorPanel
              key={`${note.id}-${revision}`}
              mode="edit"
              note={note}
              target={null}
              initialHtml={note.editDraft.html}
              userId={userId}
              timeZone={timeZone}
              actions={actions}
              onCreated={onCreated}
              onChanged={(noteId) => void reload(noteId)}
            />
            <div className="border-t pt-4">
              <AttachmentsArea
                noteId={note.id}
                attachments={note.attachments}
                canAdd
                actions={{ confirm: actions.confirmAttachment, markInError: actions.markAttachmentInError }}
                onChanged={() => void reload(note.id, false)}
              />
            </div>
          </>
        ) : (
          <NoteReader
            key={`${note.id}-${revision}`}
            note={note}
            canWrite={canWrite}
            actions={actions}
            onReload={() => void reload(note.id)}
          />
        )}
      </div>
    );
  }

  // A note that does not exist yet: the first autosave creates it.
  const target: NewNoteTarget =
    current.kind === "NEW" ? { appointmentId: current.appointment.id } : { patientId };
  const heading =
    current.kind === "NEW"
      ? t("clinicalRecords.ui.encounterOf", {
          service: current.appointment.serviceName,
          date: format.date(current.appointment.startsAt, current.appointment.unitTimeZone),
          time: format.time(current.appointment.startsAt, current.appointment.unitTimeZone),
        })
      : t("clinicalRecords.ui.standalone");
  return (
    <div className="grid gap-4">
      <h2 className="section-title">{heading}</h2>
      <p className="text-muted-foreground text-sm">{t("clinicalRecords.ui.startPrompt")}</p>
      <NoteEditorPanel
        key={`new-${revision}`}
        mode="draft"
        note={null}
        target={target}
        initialHtml=""
        userId={userId}
        timeZone={timeZone}
        actions={actions}
        onCreated={(noteId) => {
          setCreatedId(noteId);
          onCreated(noteId);
        }}
        onChanged={(noteId) => void reload(noteId)}
      />
      <div className="border-t pt-4">
        <AttachmentsArea
          noteId={createdId}
          attachments={liveAttachments}
          canAdd
          actions={{ confirm: actions.confirmAttachment, markInError: actions.markAttachmentInError }}
          onChanged={() => (createdId ? void refreshAttachments(createdId) : undefined)}
        />
      </div>
    </div>
  );
}
