"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/shared/kernel/action-result";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { ConsentItem } from "../application/consents";
import { CONSENT_METHODS, type ConsentMethod } from "../domain/consent";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";

// Consent section (PRD F05 Experience): history plus "Registrar consentimento", a dialog with the
// terms version, the method and an optional signed-term file (ADR-023 upload).
export function ConsentSection({
  patientId,
  consents,
  termsVersion,
  canManage,
  actions,
}: {
  patientId: string;
  consents: ConsentItem[];
  termsVersion: number | null;
  canManage: boolean;
  actions: {
    record: (input: {
      patientId: string;
      method: ConsentMethod;
      uploadToken: string | null;
    }) => Promise<ActionResult<{ consentId: string; termsVersion: number }>>;
    openFile: (input: { consentId: string }) => Promise<ActionResult<{ url: string }>>;
  };
}) {
  const t = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<ConsentMethod>("PAPER_UPLOADED");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const record = () =>
    startTransition(async () => {
      setFileError(null);
      let uploadToken: string | null = null;
      const file = fileRef.current?.files?.[0];
      if (file) {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/patients/consent-files", { method: "POST", body });
        const uploaded = (await response.json()) as ActionResult<{ uploadToken: string }>;
        if (!uploaded.ok) {
          setFileError(uploaded.error.message);
          return;
        }
        uploadToken = uploaded.data.uploadToken;
      }
      const result = await actions.record({ patientId, method, uploadToken });
      if (handleActionResult(result, { successMessage: t("patients.ui.consentRecorded") })) {
        setOpen(false);
        router.refresh();
      }
    });

  const openFile = (consentId: string) =>
    startTransition(async () => {
      const result = await actions.openFile({ consentId });
      if (result.ok) window.open(result.data.url, "_blank", "noopener");
      else toast.error(result.error.message, { duration: Infinity, closeButton: true });
    });

  return (
    <section aria-labelledby="consent-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="consent-title" className="section-title">
          {t("patients.ui.consentTitle")}
        </h2>
        {canManage ? (
          <Button
            variant="outline"
            disabled={termsVersion === null}
            onClick={() => setOpen(true)}
            title={termsVersion === null ? t("patients.ui.publishTermsFirst") : undefined}
          >
            {t("patients.ui.registerConsent")}
          </Button>
        ) : null}
      </div>
      {termsVersion === null ? (
        <p className="text-muted-foreground text-sm">{t("patients.ui.termsNotPublished")}</p>
      ) : null}
      {consents.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("patients.ui.noConsent")}</p>
      ) : (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.date")}</TableHead>
                <TableHead>{t("common.version")}</TableHead>
                <TableHead>{t("patients.ui.consentMethod")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("patients.ui.recordedBy")}</TableHead>
                <TableHead>{t("patients.ui.signedForm")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consents.map((consent) => (
                <TableRow key={consent.id}>
                  <TableCell className="tabular-nums">{format.dateTime(consent.consentedAt)}</TableCell>
                  <TableCell className="tabular-nums">
                    {t("patients.ui.versionShort", { version: consent.termsVersion })}
                  </TableCell>
                  <TableCell>{t(`patients.ui.consentMethods.${consent.method}`)}</TableCell>
                  <TableCell className="hidden md:table-cell">{consent.recordedByName ?? "—"}</TableCell>
                  <TableCell>
                    {consent.fileName ? (
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        disabled={pending}
                        onClick={() => openFile(consent.id)}
                      >
                        {consent.fileName}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("patients.ui.registerConsent")}</DialogTitle>
            <DialogDescription>
              {t("patients.ui.consentDialogBody", { version: termsVersion ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field id="consent-method" label={t("patients.ui.consentMethodLabel")}>
              <Select value={method} onValueChange={(value) => setMethod(value as ConsentMethod)}>
                <SelectTrigger id="consent-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSENT_METHODS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`patients.ui.consentMethods.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="consent-file"
              label={t("patients.ui.signedFormOptional")}
              error={fileError ?? undefined}
              hint={t("patients.ui.signedFormHint")}
            >
              <Input
                id="consent-file"
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={record} disabled={pending}>
              {pending ? t("common.recording") : t("patients.ui.registerConsent")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
