"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert } from "@/shared/ui/components/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/components/alert-dialog";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Field } from "@/shared/ui/forms/field";
import type { RequestActions } from "./request-actions";

// The two confirmations of the anonymization (PRD F14 Experience, design system 5.21): step 1 states
// that it is irreversible and shows what the rules found; a blocking finding replaces step 2 with its
// PRD message. Clinical records register legal retention as soon as they are found, because nothing
// personal changes. Step 2 asks for the patient's full name.

type Step =
  | { kind: "checking" }
  | { kind: "warning"; version: number }
  | { kind: "retention" }
  | { kind: "blocked" }
  | { kind: "name"; version: number }
  | { kind: "error"; message: string };

export function AnonymizeDialog({ requestId, actions }: { requestId: string; actions: RequestActions }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "checking" });
  const [typedName, setTypedName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, startTransition] = useTransition();

  // The page is refreshed only once the dialog closes: a registered retention ends the pending
  // request, and the refreshed page no longer renders this dialog, so it would vanish unread.
  function close() {
    setOpen(false);
    if (changed) {
      setChanged(false);
      router.refresh();
    }
  }

  function start() {
    setOpen(true);
    setStep({ kind: "checking" });
    setTypedName("");
    setNameError(null);
    startTransition(async () => {
      const preview = await actions.preview({ requestId });
      if (!preview.ok) return setStep({ kind: "error", message: preview.error.message });
      if (preview.data.outcome === "BLOCKED") return setStep({ kind: "blocked" });
      if (preview.data.outcome === "LEGAL_RETENTION") {
        // PRD F14: the request is registered as "retenção legal"; the typed name does not matter.
        const retained = await actions.anonymize({ requestId, typedName: "", version: preview.data.version });
        if (!retained.ok) return setStep({ kind: "error", message: retained.error.message });
        setChanged(true);
        setStep({ kind: "retention" });
        return;
      }
      setStep({ kind: "warning", version: preview.data.version });
    });
  }

  function confirm(version: number) {
    setNameError(null);
    startTransition(async () => {
      const result = await actions.anonymize({ requestId, typedName, version });
      if (result.ok) {
        toast.success(t("privacy.anonymization.done"));
        setOpen(false);
        router.refresh();
        return;
      }
      if (result.error.code === "PRIVACY_NAME_MISMATCH") {
        setNameError(result.error.fields?.typedName ?? result.error.message);
        return;
      }
      if (result.error.code === "PRIVACY_ANONYMIZATION_BLOCKED") return setStep({ kind: "blocked" });
      setStep({ kind: "error", message: result.error.message });
    });
  }

  return (
    <>
      <Button type="button" variant="destructive" onClick={start}>
        {t("privacy.anonymization.start")}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("privacy.anonymization.warningTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              {t("privacy.anonymization.hint")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {step.kind === "checking" ? (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {t("privacy.anonymization.checking")}
            </p>
          ) : null}
          {step.kind === "warning" || step.kind === "name" ? (
            <Alert variant="destructive">{t("privacy.anonymization.warning")}</Alert>
          ) : null}
          {step.kind === "retention" ? (
            <Alert variant="warning">{t("privacy.anonymization.retention")}</Alert>
          ) : null}
          {step.kind === "blocked" ? (
            <Alert variant="warning">{t("privacy.anonymization.blocked")}</Alert>
          ) : null}
          {step.kind === "error" ? <Alert variant="destructive">{step.message}</Alert> : null}
          {step.kind === "name" ? (
            <Field
              id="anonymize-name"
              label={t("privacy.anonymization.typeName")}
              error={nameError ?? undefined}
            >
              <Input
                id="anonymize-name"
                autoComplete="off"
                autoFocus
                value={typedName}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "anonymize-name-error" : undefined}
                onChange={(event) => setTypedName(event.target.value)}
              />
            </Field>
          ) : null}
          <AlertDialogFooter>
            {step.kind === "warning" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("privacy.anonymization.cancel")}
                </Button>
                <Button type="button" onClick={() => setStep({ kind: "name", version: step.version })}>
                  {t("privacy.anonymization.continue")}
                </Button>
              </>
            ) : null}
            {step.kind === "name" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t("privacy.anonymization.cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => confirm(step.version)}
                >
                  {pending ? t("privacy.anonymization.anonymizing") : t("privacy.anonymization.confirm")}
                </Button>
              </>
            ) : null}
            {step.kind === "retention" || step.kind === "blocked" || step.kind === "error" ? (
              <Button type="button" variant="outline" onClick={close}>
                {t("privacy.anonymization.close")}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
