"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/components/dialog";
import { DropdownMenuItem } from "@/shared/ui/components/dropdown-menu";
import { Input } from "@/shared/ui/components/input";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";

const digitsOnly = (value: string) => value.replace(/\D/g, "");

type PinInput = { currentPassword: string; pin: string; confirmation: string };

// Menu entry and dialog where a Manager or Administrator sets the personal approval PIN (PRD F09).
// The dialog wraps the menu item and keeps the menu open (onSelect), so closing the menu does not
// unmount it. The PIN is masked and never shown in a toast.
export function ApprovalPinMenuItem({
  action,
}: {
  action: (input: PinInput) => Promise<ActionResult<{ setAt: string }>>;
}) {
  const t = useTranslations("identity.ui.approvalPin");
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PinInput>({ currentPassword: "", pin: "", confirmation: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof PinInput, string>>>({});
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await action(values);
      if (!result.ok && result.error.fields) {
        setErrors(result.error.fields as Partial<Record<keyof PinInput, string>>);
        return;
      }
      if (handleActionResult(result, { successMessage: t("saved") })) {
        setOpen(false);
        setValues({ currentPassword: "", pin: "", confirmation: "" });
        setErrors({});
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <DropdownMenuItem onSelect={(event) => event.preventDefault()}>{t("menu")}</DropdownMenuItem>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setErrors({});
            submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <Field
            id="pin-current"
            label={t("currentPassword")}
            {...(errors.currentPassword ? { error: errors.currentPassword } : {})}
          >
            <Input
              id="pin-current"
              type="password"
              autoComplete="current-password"
              value={values.currentPassword}
              onChange={(event) => setValues({ ...values, currentPassword: event.target.value })}
            />
          </Field>
          <Field id="pin-new" label={t("pin")} {...(errors.pin ? { error: errors.pin } : {})}>
            <Input
              id="pin-new"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={values.pin}
              onChange={(event) => setValues({ ...values, pin: digitsOnly(event.target.value) })}
            />
          </Field>
          <Field
            id="pin-confirm"
            label={t("confirmation")}
            {...(errors.confirmation ? { error: errors.confirmation } : {})}
          >
            <Input
              id="pin-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={values.confirmation}
              onChange={(event) => setValues({ ...values, confirmation: digitsOnly(event.target.value) })}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
