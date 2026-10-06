"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/shared/ui/components/alert";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { AutosaveStatus } from "./autosave-controller";

// The status line above the editor (PRD F07 Experience, design system 5.12): "Rascunho salvo às
// 14:32", "Finalizado — editável até 29/09 14:10" or "Bloqueado", and the banners for a failed
// save or a note changed in another window. It is a live region, so changes are announced.
export type NoteStatusLine =
  | { kind: "draft"; savedAt: Date | null }
  | { kind: "editing"; savedAt: Date | null }
  | { kind: "finalized"; locksAt: string; autoFinalized: boolean }
  | { kind: "locked"; autoFinalized: boolean };

export function SaveStatus({
  line,
  autosave,
  timeZone,
  onRecover,
}: {
  line: NoteStatusLine;
  autosave: AutosaveStatus;
  timeZone: string;
  onRecover?: () => void;
}) {
  const t = useTranslations();
  const format = useFormatters();

  let text: string;
  if (autosave.kind === "saving") {
    text = t("clinicalRecords.ui.status.saving");
  } else if (line.kind === "draft" || line.kind === "editing") {
    const savedAt = autosave.kind === "saved" ? autosave.savedAt : line.savedAt;
    const key = line.kind === "draft" ? "draftSaved" : "editSaved";
    text = savedAt
      ? t(`clinicalRecords.ui.status.${key}`, { time: format.time(savedAt, timeZone) })
      : t(line.kind === "draft" ? "clinicalRecords.ui.status.draftNew" : "clinicalRecords.ui.status.editNew");
  } else if (line.kind === "finalized") {
    text = t("clinicalRecords.ui.status.finalized", {
      date: format.date(line.locksAt, timeZone),
      time: format.time(line.locksAt, timeZone),
    });
  } else {
    text = line.autoFinalized
      ? t("clinicalRecords.ui.status.lockedAuto")
      : t("clinicalRecords.ui.status.locked");
  }

  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-xs" role="status" aria-live="polite">
        {text}
      </p>
      {autosave.kind === "offline" ? (
        <Alert variant="warning">{t("clinicalRecords.ui.offlineBanner")}</Alert>
      ) : null}
      {autosave.kind === "stale" ? (
        <Alert variant="warning">{t("clinicalRecords.errors.CLINICAL_NOTE_STALE")}</Alert>
      ) : null}
      {autosave.kind === "locked" ? (
        <Alert variant="warning">{t("clinicalRecords.ui.lockedWhileEditing")}</Alert>
      ) : null}
      {autosave.kind === "error" ? (
        <Alert variant="destructive">{t("clinicalRecords.ui.saveError")}</Alert>
      ) : null}
      {onRecover ? (
        <Alert variant="info">
          <span>{t("clinicalRecords.ui.recoverPrompt")}</span>
          <button type="button" className="mt-1 w-fit underline underline-offset-4" onClick={onRecover}>
            {t("clinicalRecords.ui.recover")}
          </button>
        </Alert>
      ) : null}
    </div>
  );
}
