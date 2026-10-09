"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/shared/ui/components/button";
import { Label } from "@/shared/ui/components/label";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from "../domain/limits";
import type { CashActions } from "./cash-actions";

type Props = {
  id: string;
  // The id of the uploaded file, or null when none (or removed).
  value: string | null;
  fileName: string | null;
  onChange: (attachment: { id: string; name: string } | null) => void;
  actions: Pick<CashActions, "uploadIntent">;
};

// A receipt (PDF, JPG or PNG up to 10 MB, PRD F11): the browser sends it straight to the bucket with
// a presigned PUT and the form keeps only its id. The accepted types and the size are written next to
// the field; the progress is written as text.
export function AttachmentField({ id, value, fileName, onChange, actions }: Props) {
  const t = useTranslations("cash.ui");
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(file: File) {
    setProblem(null);
    if (!(ATTACHMENT_TYPES as readonly string[]).includes(file.type) || file.size > ATTACHMENT_MAX_BYTES) {
      setProblem(t("attachmentInvalid"));
      return;
    }
    setSending(true);
    try {
      const intent = await actions.uploadIntent({
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!handleActionResult(intent)) return;
      const response = await fetch(intent.data.uploadUrl, {
        method: "PUT",
        headers: intent.data.headers,
        body: file,
      });
      if (!response.ok) {
        setProblem(t("attachmentFailed"));
        return;
      }
      onChange({ id: intent.data.attachmentId, name: file.name });
    } catch {
      setProblem(t("attachmentFailed"));
    } finally {
      setSending(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{t("attachment")}</Label>
      {value ? (
        <div className="flex items-center gap-2 text-sm">
          <span>{fileName}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
            {t("removeAttachment")}
          </Button>
        </div>
      ) : (
        <input
          ref={input}
          id={id}
          type="file"
          accept={ATTACHMENT_TYPES.join(",")}
          disabled={sending}
          className="text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void send(file);
          }}
        />
      )}
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {sending ? t("attachmentSending") : t("attachmentHint")}
      </p>
      {problem ? <p className="text-destructive text-sm">{problem}</p> : null}
    </div>
  );
}
