"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { Stamp } from "@/shared/ui/components/stamp";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { NoteDetails } from "../application/queries";
import { AddendumForm } from "./addendum-form";
import { AttachmentsArea } from "./attachments-area";
import type { RecordActions } from "./record-actions";
import type { AutosaveStatus } from "./autosave-controller";
import { SaveStatus, type NoteStatusLine } from "./save-status";
import { VersionsDialog } from "./versions-dialog";

const IDLE: AutosaveStatus = { kind: "idle" };

// A note that is not being edited: a finalized note of the author (still editable for 24 hours), a
// locked note, or a colleague's note (PRD F07 Experience). Locked notes take addenda, shown below
// the original text with author and time.
export function NoteReader({
  note,
  canWrite,
  actions,
  onReload,
}: {
  note: NoteDetails;
  canWrite: boolean;
  actions: RecordActions;
  onReload: () => void;
}) {
  const t = useTranslations();
  const format = useFormatters();
  const [addingAddendum, setAddingAddendum] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = note.state === "LOCKED";
  const canEdit = note.isAuthor && note.state === "FINALIZED";
  const line: NoteStatusLine = locked
    ? { kind: "locked", autoFinalized: note.autoFinalized }
    : { kind: "finalized", locksAt: note.locksAt, autoFinalized: note.autoFinalized };

  async function startEdit() {
    setBusy(true);
    try {
      const result = await actions.startEdit({ noteId: note.id, version: note.version });
      if (handleActionResult(result)) onReload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <SaveStatus line={line} autosave={IDLE} timeZone={note.timeZone} />
      {locked ? (
        <Alert variant="info">
          {t("clinicalRecords.ui.lockedNotice", {
            date: format.date(note.locksAt, note.timeZone),
            time: format.time(note.locksAt, note.timeZone),
          })}
        </Alert>
      ) : null}
      <div className="note-prose" dangerouslySetInnerHTML={{ __html: note.html }} />
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void startEdit()}>
            {t("clinicalRecords.ui.edit")}
          </Button>
        ) : null}
        {locked && canWrite && !addingAddendum ? (
          <Button type="button" variant="outline" onClick={() => setAddingAddendum(true)}>
            {t("clinicalRecords.ui.addAddendum")}
          </Button>
        ) : null}
        {note.versionCount > 0 ? (
          <VersionsDialog noteId={note.id} timeZone={note.timeZone} actions={actions} />
        ) : null}
      </div>

      {note.addenda.length > 0 || addingAddendum ? (
        <section aria-label={t("clinicalRecords.ui.addenda")} className="grid gap-4 border-t pt-4">
          {note.addenda.map((addendum) => (
            <article key={addendum.id} className="grid gap-1">
              <h3 className="font-semibold">
                {t("clinicalRecords.ui.addendumBy", {
                  author: addendum.authorName,
                  date: format.date(addendum.createdAt, note.timeZone),
                  time: format.time(addendum.createdAt, note.timeZone),
                })}
              </h3>
              <div className="note-prose" dangerouslySetInnerHTML={{ __html: addendum.html }} />
            </article>
          ))}
          {addingAddendum ? (
            <AddendumForm
              noteId={note.id}
              actions={actions}
              onCancel={() => setAddingAddendum(false)}
              onAdded={() => {
                setAddingAddendum(false);
                onReload();
              }}
            />
          ) : null}
        </section>
      ) : null}

      <div className="border-t pt-4">
        <AttachmentsArea
          noteId={note.id}
          attachments={note.attachments}
          canAdd={note.isAuthor && !locked}
          actions={{ confirm: actions.confirmAttachment, markInError: actions.markAttachmentInError }}
          onChanged={onReload}
        />
      </div>
      {note.autoFinalized ? (
        <Stamp variant="neutral">{t("clinicalRecords.ui.status.lockedAuto")}</Stamp>
      ) : null}
    </div>
  );
}
