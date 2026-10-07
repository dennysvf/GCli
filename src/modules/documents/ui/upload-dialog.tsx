"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/shared/kernel/action-result";
import { DOCX_CONTENT_TYPE } from "@/shared/kernel/file-types";
import { Alert } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Stamp } from "@/shared/ui/components/stamp";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import { cn } from "@/shared/ui/utils";
import type { CategoryItem } from "../application/categories";
import type { StorageUsage } from "../application/quota";
import type { UploadIntentResult } from "../application/uploads";
import { titleFromFileName } from "../domain/document-file";
import { MAX_FILE_BYTES } from "../domain/limits";
import type { DocumentActions } from "./document-actions";
import { QuotaNotice } from "./quota-notice";
import { UploadQueue, type QueueItem, type SendOutcome } from "./upload-queue";

// "Enviar arquivos" (PRD F08 Experience): a drop zone, one row per file with its category, progress
// bars, and a retry for the files that failed. The browser sends each file straight to the private
// bucket (ADR-031) and the server confirms it; the files are independent of each other.

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heic",
  docx: DOCX_CONTENT_TYPE,
};
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.docx";

// Desktop browsers often leave the type of a HEIC file empty, so the extension decides; the server
// reads the real type from the bytes anyway.
function contentTypeOf(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? "";
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

type Props = {
  patientId: string;
  categories: CategoryItem[];
  usage: StorageUsage | null;
  // Whether this user will see clinical documents of the patient after sending them.
  canReadClinical: boolean;
  actions: DocumentActions;
  // Called when the dialog closes after files were sent, so the list can be refreshed.
  onUploaded: () => void;
};

export function UploadDialog({ patientId, categories, usage, canReadClinical, actions, onUploaded }: Props) {
  const t = useTranslations("documents");
  const [queue, setQueue] = useState<UploadQueue<File> | null>(null);
  // A fresh queue per opening, so a closed dialog never keeps old rows.
  const [current, setCurrent] = useState<StorageUsage | null>(usage);

  function open() {
    void actions.usage().then((result) => {
      if (result.ok) setCurrent(result.data);
    });
    setQueue(
      new UploadQueue<File>(async (item, onProgress): Promise<SendOutcome> => {
        const failed = (message: string): SendOutcome => ({ ok: false, message });
        const response = await fetch("/api/documents/uploads/intents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId,
            categoryId: item.categoryId,
            title: item.title,
            fileName: item.file.name,
            contentType: contentTypeOf(item.file),
            size: item.file.size,
          }),
        }).catch(() => null);
        const intent = (await response?.json().catch(() => null)) as ActionResult<UploadIntentResult> | null;
        if (!intent) return failed("");
        if (!intent.ok) return failed(intent.error.message);
        const stored = await putWithProgress(intent.data.url, intent.data.headers, item.file, onProgress);
        if (!stored) return failed("");
        const confirmed = await actions.confirmUpload({ uploadId: intent.data.uploadId });
        if (!confirmed.ok) return failed(confirmed.error.message);
        return { ok: true, documentId: confirmed.data.documentId, hidden: !confirmed.data.visibleToUser };
      }),
    );
  }

  function close() {
    if (queue && queue.sentCount > 0) onUploaded();
    setQueue(null);
  }

  return (
    <>
      <Button type="button" onClick={open}>
        {t("ui.uploadFiles")}
      </Button>
      <Dialog
        open={queue !== null}
        onOpenChange={(next) => {
          // Files that are being sent keep the dialog open, so their progress is never lost.
          if (!next && !queue?.busy) close();
        }}
      >
        <DialogContent className="max-w-3xl">
          {queue ? (
            <UploadBody
              queue={queue}
              categories={categories}
              usage={current}
              canReadClinical={canReadClinical}
              onClose={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function UploadBody({
  queue,
  categories,
  usage,
  canReadClinical,
  onClose,
}: {
  queue: UploadQueue<File>;
  categories: CategoryItem[];
  usage: StorageUsage | null;
  canReadClinical: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("documents");
  const format = useFormatters();
  const items = useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [overLimit, setOverLimit] = useState(false);
  // Front Desk would find an exam category first; the default is the first one anyone can read.
  // The issued category belongs to generated documents and is never offered for uploads.
  const uploadable = categories.filter((category) => !category.system);
  const defaultCategory = (uploadable.find((category) => !category.clinical) ?? uploadable[0])?.id ?? "";
  const full = usage?.level === "full";
  const busy = items.some((item) => item.state === "queued" || item.state === "uploading");
  const pending = items.filter((item) => item.state === "pending").length;

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0 || full) return;
    const added = queue.add(
      Array.from(files).map((file) => ({
        file,
        categoryId: defaultCategory,
        title: titleFromFileName(file.name),
        // The same checks the server makes, so the user gets the message before sending anything.
        refusal:
          !contentTypeOf(file) || file.size === 0 || file.size > MAX_FILE_BYTES
            ? t("errors.DOCUMENT_FILE_UNSUPPORTED", { fileName: file.name })
            : null,
      })),
    );
    setOverLimit(!added.accepted);
    if (inputRef.current) inputRef.current.value = "";
  }

  const sizeText = (bytes: number) =>
    bytes >= 1024 * 1024
      ? t("ui.sizeMb", { value: format.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 }) })
      : t("ui.sizeKb", { value: format.number(Math.max(1, Math.round(bytes / 1024))) });

  const statusText = (item: QueueItem<File>) => {
    switch (item.state) {
      case "pending":
        return t("ui.statusPending");
      case "queued":
        return t("ui.statusQueued");
      case "uploading":
        return t("ui.statusUploading", { percent: item.percent });
      case "sent":
        return t("ui.statusSent");
      default:
        return t("ui.statusFailed");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("ui.uploadTitle")}</DialogTitle>
        <DialogDescription>{t("ui.uploadHint")}</DialogDescription>
      </DialogHeader>
      <QuotaNotice usage={usage} />
      {overLimit ? <Alert variant="warning">{t("errors.DOCUMENT_BATCH_LIMIT")}</Alert> : null}
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
        <p className="text-muted-foreground text-sm">{t("ui.dropText")}</p>
        <Button type="button" variant="outline" disabled={full} onClick={() => inputRef.current?.click()}>
          {t("ui.chooseFiles")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label={t("ui.chooseFiles")}
          tabIndex={-1}
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>

      {items.length > 0 ? (
        <ul className="grid max-h-96 gap-3 overflow-y-auto" aria-live="polite">
          {items.map((item) => {
            const editable = item.state === "pending" || item.state === "failed";
            const category = uploadable.find((candidate) => candidate.id === item.categoryId);
            // Written before sending: the file will leave this user's list once it is stored.
            const hiddenHint = (category?.clinical ?? false) && !canReadClinical && item.state !== "sent";
            return (
              <li key={item.id} className="grid gap-2 border-b pb-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{item.file.name}</span>
                  <span className="text-muted-foreground text-xs">{sizeText(item.file.size)}</span>
                </div>
                {item.state === "failed" && item.message ? (
                  <p className="text-danger text-xs">{item.message}</p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <Label htmlFor={`${item.id}-category`}>{t("ui.fieldCategory")}</Label>
                    <Select
                      value={item.categoryId}
                      disabled={!editable}
                      onValueChange={(value) => queue.setCategory(item.id, value)}
                    >
                      <SelectTrigger id={`${item.id}-category`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {uploadable.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`${item.id}-title`}>{t("ui.fieldTitle")}</Label>
                    <Input
                      id={`${item.id}-title`}
                      value={item.title}
                      disabled={!editable}
                      maxLength={200}
                      onChange={(event) => queue.setTitle(item.id, event.target.value)}
                    />
                  </div>
                </div>
                {hiddenHint ? <p className="text-muted-foreground text-xs">{t("ui.clinicalHint")}</p> : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Stamp
                    variant={
                      item.state === "failed" ? "danger" : item.state === "sent" ? "success" : "neutral"
                    }
                  >
                    {statusText(item)}
                  </Stamp>
                  {item.state === "uploading" ? (
                    <progress
                      value={item.percent}
                      max={100}
                      className="min-w-24 flex-1"
                      aria-label={item.file.name}
                    />
                  ) : null}
                  {item.state === "sent" && item.hidden ? (
                    <span className="text-muted-foreground text-xs">{t("ui.sentHidden")}</span>
                  ) : null}
                  {item.state === "failed" && !item.refused ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => queue.retry(item.id)}>
                      {t("ui.retry")}
                    </Button>
                  ) : null}
                  {editable ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => queue.remove(item.id)}>
                      {t("ui.removeFile")}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {t("ui.close")}
        </Button>
        <Button type="button" disabled={pending === 0 || full} onClick={() => queue.start()}>
          {t("ui.send")}
        </Button>
      </DialogFooter>
    </>
  );
}
