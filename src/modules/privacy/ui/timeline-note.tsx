"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Alert } from "@/shared/ui/components/alert";
import { Stamp } from "@/shared/ui/components/stamp";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { TimelineNote } from "../application/timeline";
import type { TimelineActions } from "./timeline-actions";

// The full note of a clinical item (design system 5.20, 5.12). It is read when the disclosure
// opens and never cached: every expansion is a new audited read (spec decision D4).
export function TimelineNoteView({
  patientId,
  noteId,
  openNote,
}: {
  patientId: string;
  noteId: string;
  openNote: TimelineActions["openNote"];
}) {
  const t = useTranslations();
  const format = useFormatters();
  const [note, setNote] = useState<TimelineNote | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void openNote({ patientId, noteId }).then((result) => {
      if (!active) return;
      if (result.ok) setNote(result.data);
      else setError(result.error.message);
    });
    return () => {
      active = false;
    };
  }, [openNote, patientId, noteId]);

  if (error) return <Alert variant="destructive">{error}</Alert>;
  if (!note) {
    return (
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {t("privacy.ui.noteLoading")}
      </p>
    );
  }
  // The HTML comes sanitized from the F07 read (allowlist applied again on the way out, ADR-032).
  return (
    <div className="grid max-w-[72ch] gap-4">
      <div className="note-prose" dangerouslySetInnerHTML={{ __html: note.html }} />
      {note.addenda.length > 0 ? (
        <section className="grid gap-4 border-t pt-4">
          {note.addenda.map((addendum) => (
            <article key={addendum.id} className="grid gap-1">
              <h4 className="font-semibold">
                {t("privacy.ui.addendumBy", {
                  author: addendum.authorName,
                  dateTime: format.dateTime(addendum.createdAt, note.timeZone),
                })}
              </h4>
              <div className="note-prose" dangerouslySetInnerHTML={{ __html: addendum.html }} />
            </article>
          ))}
        </section>
      ) : null}
      {note.attachments.length > 0 ? (
        <section className="grid gap-1 border-t pt-4">
          <h4 className="font-semibold">{t("privacy.ui.noteAttachments")}</h4>
          <ul className="grid gap-1 text-sm">
            {note.attachments.map((attachment, index) => (
              <li key={`${attachment.fileName}-${index}`} className="flex flex-wrap items-center gap-2">
                <span>{attachment.fileName}</span>
                {attachment.inError ? (
                  <Stamp variant="neutral">{t("privacy.ui.attachmentInError")}</Stamp>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
