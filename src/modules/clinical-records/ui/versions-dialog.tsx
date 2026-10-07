"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { VersionItem } from "../application/queries";
import type { RecordActions } from "./record-actions";

// "Versões anteriores" (PRD F07): the contents that edits replaced within the 24 hours. Opening the
// dialog and each version are audited reads.
export function VersionsDialog({
  noteId,
  timeZone,
  actions,
}: {
  noteId: string;
  timeZone: string;
  actions: RecordActions;
}) {
  const t = useTranslations();
  const format = useFormatters();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionItem[] | null>(null);
  const [shown, setShown] = useState<{ number: number; html: string } | null>(null);

  async function load(next: boolean) {
    setOpen(next);
    setShown(null);
    if (!next) return;
    const result = await actions.listVersions({ noteId });
    if (handleActionResult(result)) setVersions(result.data);
  }

  async function show(version: VersionItem) {
    const result = await actions.getVersion({ versionId: version.id });
    if (handleActionResult(result)) setShown({ number: result.data.versionNumber, html: result.data.html });
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => void load(true)}>
        {t("clinicalRecords.ui.versions")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => void load(next)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("clinicalRecords.ui.versionsTitle")}</DialogTitle>
            <DialogDescription>{t("clinicalRecords.ui.versionsHint")}</DialogDescription>
          </DialogHeader>
          {versions && versions.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("clinicalRecords.ui.noVersions")}</p>
          ) : (
            <ul className="grid gap-1">
              {versions?.map((version) => (
                <li key={version.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start text-left"
                    onClick={() => void show(version)}
                  >
                    {t("clinicalRecords.ui.versionRow", {
                      number: version.versionNumber,
                      date: format.date(version.replacedAt, timeZone),
                      time: format.time(version.replacedAt, timeZone),
                      author: version.replacedByName,
                    })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {shown ? (
            <section
              aria-label={t("clinicalRecords.ui.versionNumber", { number: shown.number })}
              className="border-t pt-3"
            >
              <h3 className="column-label text-muted-foreground mb-2">
                {t("clinicalRecords.ui.versionNumber", { number: shown.number })}
              </h3>
              <div className="note-prose" dangerouslySetInnerHTML={{ __html: shown.html }} />
            </section>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
