"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/components/alert-dialog";
import { Button } from "@/shared/ui/components/button";
import { Label } from "@/shared/ui/components/label";
import { Textarea } from "@/shared/ui/components/textarea";
import { JUSTIFICATION_MAX, JUSTIFICATION_MIN } from "../domain/limits";
import { useTranslations } from "next-intl";

// A confirmation that needs a written reason (spec F06: completion reversal by a manager).
export function JustificationDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (text: string) => void;
}) {
  const t = useTranslations();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="justification-text">{t("scheduling.ui.justification")}</Label>
          <Textarea
            id="justification-text"
            value={text}
            maxLength={JUSTIFICATION_MAX}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "justification-text-error" : undefined}
            onChange={(event) => setText(event.target.value)}
          />
          {error ? (
            <p id="justification-text-error" role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              if (text.trim().length < JUSTIFICATION_MIN) {
                setError(t("scheduling.ui.justificationHint"));
                return;
              }
              onConfirm(text.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
