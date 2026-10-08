"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/components/button";
import { RichTextEditor } from "@/shared/ui/rich-text/rich-text-editor";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { ADDENDUM_MAX_CHARACTERS } from "../domain/limits";
import type { RecordActions } from "./record-actions";

// "Adicionar adendo" (PRD F07): a small editor under a locked note. An addendum has its own author
// and timestamp and cannot be changed afterwards.
export function AddendumForm({
  noteId,
  actions,
  onAdded,
  onCancel,
}: {
  noteId: string;
  actions: RecordActions;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const result = await actions.addAddendum({ noteId, html });
      if (handleActionResult(result, { successMessage: t("clinicalRecords.ui.addendumToast") })) onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <RichTextEditor
        initialHtml=""
        label={t("clinicalRecords.ui.addendumLabel")}
        maxCharacters={ADDENDUM_MAX_CHARACTERS}
        onChange={(nextHtml, nextText) => {
          setHtml(nextHtml);
          setText(nextText);
        }}
        autoFocus
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || text.trim() === ""}
          onClick={() => void submit()}
        >
          {t("clinicalRecords.ui.saveAddendum")}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t("clinicalRecords.ui.cancel")}
        </Button>
      </div>
    </div>
  );
}
