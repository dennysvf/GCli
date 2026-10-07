"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import { Checkbox } from "@/shared/ui/components/checkbox";
import { Label } from "@/shared/ui/components/label";
import { Stamp } from "@/shared/ui/components/stamp";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import { cn } from "@/shared/ui/utils";
import type { AttachmentItem } from "../application/queries";
import type { AttachmentSummary, UploadIntentResult } from "../application/attachments";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_NOTE } from "../domain/limits";

// Attachments of a note (PRD F07 Experience): drag-and-drop, per-file progress and thumbnails. The
// browser sends each file straight to the private bucket (ADR-031) and the server confirms it.

export type AttachmentActions = {
  confirm: (input: { uploadId: string }) => Promise<ActionResult<AttachmentSummary>>;
  markInError: (input: { attachmentId: string }) => Promise<ActionResult<{ markedInErrorAt: string }>>;
};

type Upload = {
  key: string;
  name: string;
  percent: number;
  state: "uploading" | "failed";
  message: string | null;
};

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heic",
};

// How often the list is refreshed while an attachment is being processed.
const PROCESSING_POLL_MS = 4_000;

const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"]);

// Desktop browsers often leave the type of a HEIC file empty, so the extension decides.
function contentTypeOf(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_TYPES.has(file.type) ? file.type : (EXTENSION_TYPES[extension] ?? file.type);
}

function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => resolve(request.status >= 200 && request.status < 300);
    request.onerror = () => resolve(false);
    request.send(file);
  });
}

export function AttachmentsArea({
  noteId,
  attachments,
  canAdd,
  actions,
  onChanged,
}: {
  noteId: string | null;
  attachments: AttachmentItem[];
  canAdd: boolean;
  actions: AttachmentActions;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const format = useFormatters();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [dragging, setDragging] = useState(false);

  // The worker converts and thumbnails images in the background: while one is processing, the
  // list is refreshed until it is ready.
  const processing = attachments.some((item) => item.status === "PROCESSING");
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(onChanged, PROCESSING_POLL_MS);
    return () => clearInterval(timer);
  }, [processing, onChanged]);

  const active = attachments.filter((item) => !item.inError).length;
  const hidden = attachments.filter((item) => item.inError).length;
  const visible = showHidden ? attachments : attachments.filter((item) => !item.inError);
  const unsupported = t("clinicalRecords.errors.CLINICAL_ATTACHMENT_UNSUPPORTED");

  const patch = (key: string, changes: Partial<Upload>) =>
    setUploads((current) =>
      current.map((upload) => (upload.key === key ? { ...upload, ...changes } : upload)),
    );

  async function send(file: File, key: string) {
    if (!noteId) return;
    const contentType = contentTypeOf(file);
    const response = await fetch("/api/clinical/attachments/intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, fileName: file.name, contentType, size: file.size }),
    }).catch(() => null);
    const intent = (await response?.json().catch(() => null)) as ActionResult<UploadIntentResult> | null;
    if (!intent || !intent.ok) {
      patch(key, {
        state: "failed",
        message: intent && !intent.ok ? intent.error.message : t("clinicalRecords.ui.uploadFailed"),
      });
      return;
    }
    const stored = await putWithProgress(intent.data.url, intent.data.headers, file, (percent) =>
      patch(key, { percent }),
    );
    if (!stored) {
      patch(key, { state: "failed", message: t("clinicalRecords.ui.uploadFailed") });
      return;
    }
    const confirmed = await actions.confirm({ uploadId: intent.data.uploadId });
    if (!confirmed.ok) {
      patch(key, { state: "failed", message: confirmed.error.message });
      return;
    }
    setUploads((current) => current.filter((upload) => upload.key !== key));
    onChanged();
  }

  function addFiles(files: FileList | null) {
    if (!files || !canAdd || !noteId) return;
    let free =
      ATTACHMENT_MAX_PER_NOTE - active - uploads.filter((upload) => upload.state === "uploading").length;
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      const type = contentTypeOf(file);
      // The same checks the server makes, so the user gets the message before sending anything.
      const message =
        !ALLOWED_TYPES.has(type) || file.size > ATTACHMENT_MAX_BYTES || file.size === 0
          ? unsupported
          : free <= 0
            ? t("clinicalRecords.errors.CLINICAL_ATTACHMENT_LIMIT")
            : null;
      if (message) {
        setUploads((current) => [...current, { key, name: file.name, percent: 0, state: "failed", message }]);
        continue;
      }
      free -= 1;
      setUploads((current) => [
        ...current,
        { key, name: file.name, percent: 0, state: "uploading", message: null },
      ]);
      void send(file, key);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function markInError(item: AttachmentItem) {
    const result = await actions.markInError({ attachmentId: item.id });
    if (handleActionResult(result, { successMessage: t("clinicalRecords.ui.attachmentInErrorToast") })) {
      onChanged();
    }
  }

  const statusText = (item: AttachmentItem) =>
    item.status === "PROCESSING"
      ? t("clinicalRecords.ui.attachmentProcessing")
      : item.status === "FAILED"
        ? t("clinicalRecords.ui.attachmentFailed")
        : t("clinicalRecords.ui.attachmentReady");

  return (
    <section aria-labelledby="attachments-title" className="grid gap-3">
      <h3 id="attachments-title" className="section-title">
        {t("clinicalRecords.ui.attachments")}
      </h3>
      {canAdd ? (
        noteId ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              addFiles(event.dataTransfer.files);
            }}
            className={cn(
              "border-ink-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4",
              dragging && "bg-paper-1 border-ink-blue",
            )}
          >
            <p className="text-muted-foreground text-sm">{t("clinicalRecords.ui.dropText")}</p>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              {t("clinicalRecords.ui.chooseFiles")}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif"
              className="sr-only"
              aria-label={t("clinicalRecords.ui.chooseFiles")}
              tabIndex={-1}
              onChange={(event) => addFiles(event.target.files)}
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{t("clinicalRecords.ui.attachmentsAfterSave")}</p>
        )
      ) : null}

      {uploads.length > 0 ? (
        <ul className="grid gap-2" aria-live="polite">
          {uploads.map((upload) => (
            <li key={upload.key} className="grid gap-1 text-sm">
              <span>{upload.name}</span>
              {upload.state === "uploading" ? (
                <>
                  <progress value={upload.percent} max={100} className="w-full" aria-label={upload.name} />
                  <span className="text-muted-foreground text-xs">
                    {t("clinicalRecords.ui.uploading", { percent: upload.percent })}
                  </span>
                </>
              ) : (
                <span className="text-danger text-xs">{upload.message}</span>
              )}
              {upload.state === "failed" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  onClick={() => setUploads((current) => current.filter((item) => item.key !== upload.key))}
                >
                  {t("clinicalRecords.ui.dismiss")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {visible.length === 0 && uploads.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("clinicalRecords.ui.noAttachments")}</p>
      ) : (
        <ul className="grid gap-2">
          {visible.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 border-b pb-2">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL from the bucket.
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="size-12 rounded-xs border object-cover"
                />
              ) : (
                <span className="bg-paper-1 text-muted-foreground column-label flex size-12 items-center justify-center rounded-xs border">
                  {item.contentType === "application/pdf"
                    ? t("clinicalRecords.ui.pdfIcon")
                    : t("clinicalRecords.ui.fileIcon")}
                </span>
              )}
              <div className="grid min-w-0 flex-1 gap-0.5">
                <a
                  href={`/api/clinical/attachments/${item.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate underline-offset-4 hover:underline"
                >
                  {item.fileName}
                </a>
                <span className="text-muted-foreground text-xs">
                  {t("clinicalRecords.ui.sizeMb", {
                    value: format.number(item.size / (1024 * 1024), { maximumFractionDigits: 1 }),
                  })}
                  {" · "}
                  {statusText(item)}
                </span>
              </div>
              {item.inError ? <Stamp variant="neutral">{t("clinicalRecords.ui.inErrorStamp")}</Stamp> : null}
              {item.canMarkInError ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void markInError(item)}>
                  {t("clinicalRecords.ui.markInError")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-hidden-attachments"
            checked={showHidden}
            onCheckedChange={(checked) => setShowHidden(checked === true)}
          />
          <Label htmlFor="show-hidden-attachments">{t("clinicalRecords.ui.showHidden")}</Label>
        </div>
      ) : null}
    </section>
  );
}
