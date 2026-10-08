"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import { RichTextEditor } from "@/shared/ui/rich-text/rich-text-editor";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { NoteDetails } from "../application/queries";
import { AUTOSAVE_INTERVAL_MS, AUTOSAVE_RETRY_MS, NOTE_MAX_CHARACTERS } from "../domain/limits";
import { AutosaveController, type AutosaveStatus, type SaveOutcome } from "./autosave-controller";
import { clearBackup, parseBackup, readBackupRaw, writeBackup } from "./local-backup";
import type { RecordActions } from "./record-actions";
import { SaveStatus, type NoteStatusLine } from "./save-status";

const FINALIZE = "finalize";
const PUBLISH = "publish";

// Where a new note comes from: an appointment, or a standalone record for the patient.
export type NewNoteTarget = { appointmentId: string } | { patientId: string };

type Props = {
  mode: "draft" | "edit";
  // Null while the note does not exist yet; the first save creates it.
  note: NoteDetails | null;
  target: NewNoteTarget | null;
  initialHtml: string;
  userId: string;
  timeZone: string;
  actions: RecordActions;
  onCreated: (noteId: string) => void;
  // After finalizing, publishing or discarding: the parent reloads the note.
  onChanged: (noteId: string) => void;
};

// Maps a failed save to what the controller does next: a lost connection is retried, anything else
// stops and keeps the text (PRD F07 Error Handling).
function outcomeOf(result: ActionResult<unknown>): SaveOutcome {
  if (result.ok) return { kind: "error" };
  if (result.error.code === "CLINICAL_NOTE_STALE") return { kind: "stale" };
  if (result.error.code === "CLINICAL_NOTE_LOCKED") return { kind: "locked" };
  return { kind: "error" };
}

// The editor of a draft or of the edit draft of a finalized note: autosave, the browser backup,
// and the buttons that end the work ("Finalizar registro", "Salvar alterações").
export function NoteEditorPanel({
  mode,
  note,
  target,
  initialHtml,
  userId,
  timeZone,
  actions,
  onCreated,
  onChanged,
}: Props) {
  const t = useTranslations();
  const noteId = useRef(note?.id ?? null);
  const version = useRef(note?.version ?? 0);
  const latestHtml = useRef(initialHtml);
  const controller = useRef<AutosaveController | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [startHtml, setStartHtml] = useState(initialHtml);
  const [editorKey, setEditorKey] = useState(0);
  const savedAt = note ? new Date(note.draftSavedAt) : null;

  // A new note is first backed up under the key of its target; once created it has its own key.
  // Clearing removes both, so a backup written before the first save never outlives it.
  const newKey = `new:${target && "appointmentId" in target ? target.appointmentId : (target?.patientId ?? "")}`;
  const backupKey = useCallback(() => noteId.current ?? newKey, [newKey]);
  const clearBackups = useCallback(() => {
    clearBackup(userId, newKey);
    if (noteId.current) clearBackup(userId, noteId.current);
  }, [userId, newKey]);

  // A backup left by an earlier session (closed tab, lost connection) newer than the server copy.
  // Read through useSyncExternalStore: the server renders without it and the browser adds it.
  const rawBackup = useSyncExternalStore(
    () => () => undefined,
    () => readBackupRaw(userId, backupKey()),
    () => null,
  );
  const [recovered, setRecovered] = useState(false);
  const backup = parseBackup(rawBackup);
  const serverTime = note ? new Date(note.draftSavedAt).getTime() : 0;
  const recoverable =
    status.kind === "idle" &&
    !recovered &&
    backup !== null &&
    backup.html !== initialHtml &&
    new Date(backup.savedAt).getTime() > serverTime
      ? backup.html
      : null;

  const save = useCallback(
    async (html: string): Promise<SaveOutcome> => {
      const base = noteId.current
        ? { noteId: noteId.current, version: version.current, html }
        : { ...(target ?? {}), html };
      const result = await (mode === "edit" ? actions.saveEditDraft(base) : actions.saveDraft(base));
      if (!result.ok) return outcomeOf(result);
      const created = noteId.current === null;
      noteId.current = result.data.noteId;
      version.current = result.data.version;
      if (created) onCreated(result.data.noteId);
      return { kind: "saved", savedAt: new Date(result.data.savedAt) };
    },
    [actions, mode, onCreated, target],
  );

  useEffect(() => {
    const instance = new AutosaveController({
      save,
      intervalMs: AUTOSAVE_INTERVAL_MS,
      retryMs: AUTOSAVE_RETRY_MS,
      backup: {
        write: (html) =>
          writeBackup(userId, backupKey(), {
            html,
            savedAt: new Date().toISOString(),
            baseVersion: version.current,
          }),
        clear: clearBackups,
      },
      onStatus: setStatus,
    });
    controller.current = instance;
    instance.start(initialHtml);
    // A recovered text starts dirty, so the next tick sends it.
    if (startHtml !== initialHtml) instance.change(startHtml);
    const online = () => instance.online();
    const hidden = () => {
      if (document.visibilityState === "hidden") void instance.flush();
    };
    const pageHide = () => instance.pageHide();
    window.addEventListener("online", online);
    window.addEventListener("pagehide", pageHide);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("pagehide", pageHide);
      document.removeEventListener("visibilitychange", hidden);
      instance.stop();
    };
    // The controller is rebuilt only when the editor is remounted (recovery).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey]);

  const onChange = (html: string, text: string) => {
    latestHtml.current = html;
    // Nothing is created until there is text (spec F07 section 3).
    if (!noteId.current && text.trim() === "") return;
    controller.current?.change(html);
  };

  // Everything typed is on the server before the note is finalized or the edit is published.
  async function settle(): Promise<boolean> {
    const current = controller.current;
    if (!current) return false;
    await current.settle();
    await current.flush();
    await current.settle();
    return !current.dirty;
  }

  async function finish(kind: typeof FINALIZE | typeof PUBLISH) {
    setBusy(true);
    try {
      // Text that could not be saved (offline, stale, locked) stays in the editor and the browser
      // backup; the status banner already says why.
      if (!(await settle())) return;
      if (!noteId.current) {
        const first = await actions.saveDraft({ ...(target ?? {}), html: latestHtml.current });
        if (!handleActionResult(first)) return;
        noteId.current = first.data.noteId;
        version.current = first.data.version;
        onCreated(first.data.noteId);
      }
      const input = { noteId: noteId.current, version: version.current, html: latestHtml.current };
      const successMessage = t(
        kind === FINALIZE ? "clinicalRecords.ui.finalizedToast" : "clinicalRecords.ui.changesSavedToast",
      );
      const done =
        kind === FINALIZE
          ? handleActionResult(await actions.finalize(input), { successMessage })
          : handleActionResult(await actions.publishEdit(input), { successMessage });
      if (done && noteId.current) {
        clearBackups();
        onChanged(noteId.current);
      }
    } catch {
      toast.error(t("clinicalRecords.ui.offlineBanner"), { duration: Infinity, closeButton: true });
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!noteId.current) return;
    setBusy(true);
    try {
      await controller.current?.settle();
      const result = await actions.discardEdit({ noteId: noteId.current, version: version.current });
      if (handleActionResult(result)) {
        clearBackups();
        onChanged(noteId.current);
      }
    } finally {
      setBusy(false);
    }
  }

  const line: NoteStatusLine = mode === "draft" ? { kind: "draft", savedAt } : { kind: "editing", savedAt };

  return (
    <div className="grid gap-3">
      <SaveStatus
        line={line}
        autosave={status}
        timeZone={timeZone}
        onRecover={
          recoverable !== null
            ? () => {
                setStartHtml(recoverable);
                setRecovered(true);
                setEditorKey((value) => value + 1);
              }
            : undefined
        }
      />
      <RichTextEditor
        key={editorKey}
        initialHtml={startHtml}
        label={t("clinicalRecords.ui.editor.label")}
        maxCharacters={NOTE_MAX_CHARACTERS}
        onChange={onChange}
        onBlur={() => void controller.current?.flush()}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-2">
        {mode === "draft" ? (
          <Button type="button" disabled={busy} onClick={() => void finish(FINALIZE)}>
            {t("clinicalRecords.ui.finalize")}
          </Button>
        ) : (
          <>
            <Button type="button" disabled={busy} onClick={() => void finish(PUBLISH)}>
              {t("clinicalRecords.ui.saveChanges")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void discard()}>
              {t("clinicalRecords.ui.discardChanges")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
