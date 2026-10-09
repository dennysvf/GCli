"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { Currency } from "@/shared/kernel/countries/codes";
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
import { MoneyInput } from "@/shared/ui/forms/money-input";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { CategoryRecord } from "../application/ports";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "../domain/limits";
import { AttachmentField } from "./attachment-field";
import type { CashActions } from "./cash-actions";

const validReason = (text: string) => text.trim().length >= REASON_MIN_LENGTH;

// A dialog around one form: the title, a hint, the fields and the two buttons. The primary action
// of the dialog is the submit button (design system 5.1).
function FormDialog({
  title,
  hint,
  submitLabel,
  submitDisabled,
  danger = false,
  pending,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  hint?: string;
  submitLabel: string;
  submitDisabled: boolean;
  danger?: boolean;
  pending: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("cash.ui");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <form
          className="grid gap-4"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!submitDisabled && !pending) onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{hint ?? title}</DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              variant={danger ? "destructive" : "default"}
              disabled={submitDisabled || pending}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReasonField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("cash.ui");
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={REASON_MAX_LENGTH}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-muted-foreground text-xs">
        {t("reasonHint", { min: REASON_MIN_LENGTH, count: value.trim().length })}
      </p>
    </div>
  );
}

export function OpenRegisterForm({
  unitId,
  businessDate,
  currency,
  suggestedOpeningMinor,
  actions,
  onOpened,
}: {
  unitId: string;
  businessDate: string;
  currency: string;
  suggestedOpeningMinor: number;
  actions: Pick<CashActions, "open">;
  onOpened: () => void;
}) {
  const t = useTranslations("cash.ui");
  const [opening, setOpening] = useState(suggestedOpeningMinor);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const changed = opening !== suggestedOpeningMinor;
  const blocked = changed && !validReason(reason);

  function submit() {
    startTransition(async () => {
      const result = await actions.open({
        unitId,
        businessDate,
        openingMinor: opening,
        openingReason: changed ? reason.trim() : null,
      });
      if (handleActionResult(result, { successMessage: t("openedToast") })) onOpened();
    });
  }

  return (
    <form
      className="grid max-w-md gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked && !pending) submit();
      }}
    >
      <p className="text-muted-foreground text-sm">{t("notOpenHint")}</p>
      <div className="grid gap-1">
        <Label htmlFor="opening-balance">{t("openingBalance")}</Label>
        <MoneyInput
          id="opening-balance"
          currency={currency as Currency}
          value={opening}
          onChange={setOpening}
        />
        <p className="text-muted-foreground text-xs">{t("openingSuggested")}</p>
      </div>
      {changed ? (
        <ReasonField id="opening-reason" label={t("openingReason")} value={reason} onChange={setReason} />
      ) : null}
      <div>
        <Button type="submit" disabled={blocked || pending}>
          {t("openRegister")}
        </Button>
      </div>
    </form>
  );
}

export function MovementDialog({
  registerId,
  currency,
  categories,
  actions,
  onDone,
  onClose,
}: {
  registerId: string;
  currency: string;
  categories: CategoryRecord[];
  actions: Pick<CashActions, "recordMovement" | "uploadIntent">;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [attachment, setAttachment] = useState<{ id: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const kinds = direction === "IN" ? ["REVENUE", "TRANSFER"] : ["EXPENSE", "TRANSFER"];
  const options = categories.filter((category) => category.active && kinds.includes(category.kind));
  const valid = amount > 0 && description.trim().length >= 3 && options.some((c) => c.id === categoryId);

  function submit() {
    startTransition(async () => {
      const result = await actions.recordMovement({
        registerId,
        direction,
        amountMinor: amount,
        description: description.trim(),
        categoryId,
        attachmentId: attachment?.id ?? null,
      });
      if (!handleActionResult(result, { successMessage: t("movementToast") })) return;
      onDone();
      onClose();
    });
  }

  return (
    <FormDialog
      title={t("newMovement")}
      hint={t("movementHint")}
      submitLabel={t("recordMovement")}
      submitDisabled={!valid}
      pending={pending}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="grid gap-1">
        <Label htmlFor="movement-direction">{t("direction")}</Label>
        <Select
          value={direction}
          onValueChange={(value) => {
            setDirection(value as "IN" | "OUT");
            setCategoryId("");
          }}
        >
          <SelectTrigger id="movement-direction">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="OUT">{t("directionOut")}</SelectItem>
            <SelectItem value="IN">{t("directionIn")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="movement-amount">{t("amount")}</Label>
        <MoneyInput
          id="movement-amount"
          currency={currency as Currency}
          value={amount}
          onChange={setAmount}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="movement-description">{t("description")}</Label>
        <Input
          id="movement-description"
          value={description}
          maxLength={200}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="movement-category">{t("category")}</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="movement-category">
            <SelectValue placeholder={t("chooseCategory")} />
          </SelectTrigger>
          <SelectContent>
            {options.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AttachmentField
        id="movement-attachment"
        value={attachment?.id ?? null}
        fileName={attachment?.name ?? null}
        onChange={setAttachment}
        actions={actions}
      />
    </FormDialog>
  );
}

export function ReverseDialog({
  movementId,
  actions,
  onDone,
  onClose,
}: {
  movementId: string;
  actions: Pick<CashActions, "reverseMovement">;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await actions.reverseMovement({ movementId, reason: reason.trim() });
      if (!handleActionResult(result, { successMessage: t("reversedToast") })) return;
      onDone();
      onClose();
    });
  }

  return (
    <FormDialog
      title={t("reverseMovement")}
      hint={t("reverseHint")}
      submitLabel={t("confirmReverse")}
      submitDisabled={!validReason(reason)}
      danger
      pending={pending}
      onSubmit={submit}
      onClose={onClose}
    >
      <ReasonField id="reverse-reason" label={t("reason")} value={reason} onChange={setReason} />
    </FormDialog>
  );
}

export function CloseDialog({
  registerId,
  currency,
  expectedMinor,
  actions,
  onDone,
  onClose,
}: {
  registerId: string;
  currency: string;
  expectedMinor: number;
  actions: Pick<CashActions, "close">;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const format = useFormatters();
  const [counted, setCounted] = useState(expectedMinor > 0 ? expectedMinor : 0);
  const [justification, setJustification] = useState("");
  const [pending, startTransition] = useTransition();
  const difference = counted - expectedMinor;
  const money = (minor: number) => format.money({ amountMinor: minor, currency: currency as Currency });
  const needsReason = difference !== 0;

  function submit() {
    startTransition(async () => {
      const result = await actions.close({
        registerId,
        countedMinor: counted,
        justification: needsReason ? justification.trim() : null,
      });
      if (!handleActionResult(result, { successMessage: t("closedToast") })) return;
      onDone();
      onClose();
    });
  }

  return (
    <FormDialog
      title={t("closeRegister")}
      hint={t("closeHint")}
      submitLabel={t("confirmClose")}
      submitDisabled={needsReason && !validReason(justification)}
      pending={pending}
      onSubmit={submit}
      onClose={onClose}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("expectedCash")}</dt>
        <dd className="text-right font-mono">{money(expectedMinor)}</dd>
      </dl>
      <div className="grid gap-1">
        <Label htmlFor="counted-cash">{t("countedCash")}</Label>
        <MoneyInput id="counted-cash" currency={currency as Currency} value={counted} onChange={setCounted} />
      </div>
      <p
        className={
          difference === 0
            ? "text-muted-foreground text-sm"
            : difference > 0
              ? "text-success text-sm"
              : "text-destructive text-sm"
        }
        aria-live="polite"
      >
        {difference === 0
          ? t("noDifference")
          : difference > 0
            ? t("surplus", { amount: money(difference) })
            : t("shortfall", { amount: money(-difference) })}
      </p>
      {needsReason ? (
        <ReasonField
          id="close-justification"
          label={t("justification")}
          value={justification}
          onChange={setJustification}
        />
      ) : null}
    </FormDialog>
  );
}

export function ReopenDialog({
  registerId,
  actions,
  onDone,
  onClose,
}: {
  registerId: string;
  actions: Pick<CashActions, "reopen">;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await actions.reopen({ registerId, reason: reason.trim() });
      if (!handleActionResult(result, { successMessage: t("reopenedToast") })) return;
      onDone();
      onClose();
    });
  }

  return (
    <FormDialog
      title={t("reopenRegister")}
      hint={t("reopenHint")}
      submitLabel={t("confirmReopen")}
      submitDisabled={!validReason(reason)}
      pending={pending}
      onSubmit={submit}
      onClose={onClose}
    >
      <ReasonField id="reopen-reason" label={t("reason")} value={reason} onChange={setReason} />
    </FormDialog>
  );
}
