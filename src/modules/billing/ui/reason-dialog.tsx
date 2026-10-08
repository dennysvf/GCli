"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { Label } from "@/shared/ui/components/label";
import { Textarea } from "@/shared/ui/components/textarea";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "../domain/limits";

// Refund, void and rejection ask for a required reason, state the consequence in one sentence
// and use the danger button (design system 5.14).
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  // Extra fields above the reason (the amount of a partial refund).
  children?: ReactNode;
  onConfirm: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations("billing.ui");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const valid = reason.trim().length >= REASON_MIN_LENGTH;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid || pending) return;
            startTransition(async () => {
              if (await onConfirm(reason.trim())) onClose();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <div className="grid gap-1">
            <Label htmlFor="reason-text">{t("reason")}</Label>
            <Textarea
              id="reason-text"
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              onChange={(event) => setReason(event.target.value)}
              aria-describedby="reason-hint"
            />
            <p id="reason-hint" className="text-muted-foreground text-xs">
              {t("reasonHint")}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={!valid || pending}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
