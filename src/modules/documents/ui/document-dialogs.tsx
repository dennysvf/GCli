"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Textarea } from "@/shared/ui/components/textarea";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { CategoryItem } from "../application/categories";
import type { DocumentItem } from "../application/documents";
import { ARCHIVE_REASON_MAX, TITLE_MAX } from "../domain/limits";
import type { DocumentActions } from "./document-actions";

// Corrections of an uploaded document (PRD F08): title and category, and archiving with a reason.
// The dialogs are mounted only while open, so each opening starts from the document as it is.

export function EditDocumentDialog({
  document,
  categories,
  actions,
  onClose,
  onSaved,
}: {
  document: DocumentItem | null;
  categories: CategoryItem[];
  actions: DocumentActions;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={document !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {document ? (
          <EditForm
            key={document.id}
            document={document}
            categories={categories}
            actions={actions}
            onClose={onClose}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  document,
  categories,
  actions,
  onClose,
  onSaved,
}: {
  document: DocumentItem;
  categories: CategoryItem[];
  actions: DocumentActions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("documents");
  const [title, setTitle] = useState(document.title);
  const [categoryId, setCategoryId] = useState(document.categoryId);
  const [busy, setBusy] = useState(false);
  // A category that was deactivated after the upload still has to show as the current one.
  const choices = categories.filter((category) => !category.system);
  const options = choices.some((category) => category.id === document.categoryId)
    ? choices
    : [...choices, { id: document.categoryId, name: document.categoryName } as CategoryItem];

  async function save() {
    setBusy(true);
    try {
      const result = await actions.update({
        documentId: document.id,
        title,
        categoryId,
        version: document.version,
      });
      if (handleActionResult(result, { successMessage: t("ui.updatedToast") })) {
        onSaved();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("ui.editTitle")}</DialogTitle>
        <DialogDescription>{t("ui.editHint")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <Label htmlFor="edit-document-title">{t("ui.fieldTitle")}</Label>
          <Input
            id="edit-document-title"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="edit-document-category">{t("ui.fieldCategory")}</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="edit-document-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("ui.cancel")}
        </Button>
        <Button type="button" disabled={busy || title.trim() === ""} onClick={() => void save()}>
          {t("ui.save")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ArchiveDocumentDialog({
  document,
  actions,
  onClose,
  onDone,
}: {
  document: DocumentItem | null;
  actions: DocumentActions;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={document !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {document ? (
          <ArchiveForm
            key={document.id}
            document={document}
            actions={actions}
            onClose={onClose}
            onDone={onDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ArchiveForm({
  document,
  actions,
  onClose,
  onDone,
}: {
  document: DocumentItem;
  actions: DocumentActions;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("documents");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function archive() {
    setBusy(true);
    try {
      const result = await actions.archive({ documentId: document.id, reason, version: document.version });
      if (handleActionResult(result, { successMessage: t("ui.archivedToast") })) {
        onDone();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("ui.archiveTitle")}</DialogTitle>
        <DialogDescription>{t("ui.archiveHint", { title: document.title })}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1">
        <Label htmlFor="archive-reason">{t("ui.reasonLabel")}</Label>
        <Textarea
          id="archive-reason"
          value={reason}
          maxLength={ARCHIVE_REASON_MAX}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("ui.cancel")}
        </Button>
        <Button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void archive()}>
          {t("ui.archive")}
        </Button>
      </DialogFooter>
    </>
  );
}
