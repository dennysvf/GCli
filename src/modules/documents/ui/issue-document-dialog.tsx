"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Textarea } from "@/shared/ui/components/textarea";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { DocumentPreview, IssueOptions } from "../application/generation";
import { FIELD_VALUE_MAX } from "../domain/limits";
import { fieldLabel } from "../domain/template-variables";
import type { DocumentActions } from "./document-actions";

// "Emitir documento" (PRD F08 Experience): model → professional and unit → free fields → live
// preview → "Gerar PDF", which opens in a new tab and appears in the list. A document with blank
// values asks for confirmation first, and its blanks are marked in the preview.

const PREVIEW_DEBOUNCE_MS = 400;

type Props = {
  patientId: string;
  options: IssueOptions;
  actions: DocumentActions;
  // Called after a document was issued, so the list can be refreshed.
  onIssued: () => void;
};

export function IssueDocumentDialog({ patientId, options, actions, onIssued }: Props) {
  const t = useTranslations("documents");
  const [open, setOpen] = useState(false);
  if (options.templates.length === 0) return null;
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {t("ui.issueDocument")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <IssueBody
            patientId={patientId}
            options={options}
            actions={actions}
            onClose={() => setOpen(false)}
            onIssued={onIssued}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function IssueBody({ patientId, options, actions, onClose, onIssued }: Props & { onClose: () => void }) {
  const t = useTranslations("documents");
  const [templateId, setTemplateId] = useState(options.templates[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState(
    options.professionals.find((professional) => professional.id === options.linkedProfessionalId)?.id ?? "",
  );
  const [unitId, setUnitId] = useState(options.defaultUnitId ?? "");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  const template = options.templates.find((candidate) => candidate.id === templateId);
  // A clinical document is always signed by the user's own professional profile.
  const signerLocked = template?.clinical === true;
  const signer = signerLocked ? (options.linkedProfessionalId ?? "") : professionalId;
  const fieldsKey = JSON.stringify(template?.fields.map((name) => fields[name] ?? "") ?? []);
  const ready = templateId !== "" && signer !== "" && unitId !== "";

  // The preview follows what the user types, a moment after the last change.
  useEffect(() => {
    if (!ready) return;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      const result = await actions.preview({ patientId, templateId, professionalId: signer, unitId, fields });
      // Only the answer to the latest change is shown.
      if (request !== latest.current) return;
      setPreview(result.ok ? result.data : null);
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `fields` is read through `fieldsKey`, which changes exactly when a field of the template does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, actions, patientId, templateId, signer, unitId, fieldsKey]);

  function change(update: () => void) {
    update();
    setConfirming(false);
  }

  async function generate() {
    const hasBlanks = (preview?.missing.length ?? 0) > 0;
    if (hasBlanks && !confirming) {
      setConfirming(true);
      return;
    }
    // The tab is opened by the click, before the request, so the browser does not block it.
    const tab = window.open("", "_blank");
    setBusy(true);
    try {
      const result = await actions.generate({
        patientId,
        templateId,
        professionalId: signer,
        unitId,
        fields,
        confirmMissing: confirming,
      });
      if (result.ok) {
        if (tab) tab.location.href = result.data.openUrl;
        else window.open(result.data.openUrl, "_blank");
        handleActionResult(result, { successMessage: t("ui.issuedToast") });
        onIssued();
        onClose();
        return;
      }
      tab?.close();
      if (result.error.code === "DOCUMENT_MISSING_VALUES") setConfirming(true);
      else handleActionResult(result);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("ui.issueTitle")}</DialogTitle>
        <DialogDescription>{t("ui.issueHint")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <div className="grid gap-1">
            <Label htmlFor="issue-template">{t("ui.fieldTemplate")}</Label>
            <Select
              value={templateId}
              onValueChange={(value) =>
                change(() => {
                  setTemplateId(value);
                  setFields({});
                })
              }
            >
              <SelectTrigger id="issue-template" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.templates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.clinical ? t("ui.templateClinical", { name: item.name }) : item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="issue-professional">{t("ui.fieldProfessional")}</Label>
            <Select
              value={signer}
              disabled={signerLocked}
              onValueChange={(value) => change(() => setProfessionalId(value))}
            >
              <SelectTrigger id="issue-professional" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.professionals.map((professional) => (
                  <SelectItem key={professional.id} value={professional.id}>
                    {professional.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {signerLocked ? <p className="text-muted-foreground text-xs">{t("ui.signerLocked")}</p> : null}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="issue-unit">{t("ui.fieldUnit")}</Label>
            <Select value={unitId} onValueChange={(value) => change(() => setUnitId(value))}>
              <SelectTrigger id="issue-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {template?.fields.map((name) => (
            <div key={name} className="grid gap-1">
              <Label htmlFor={`issue-field-${name}`}>{fieldLabel(name)}</Label>
              <Textarea
                id={`issue-field-${name}`}
                rows={2}
                maxLength={FIELD_VALUE_MAX}
                value={fields[name] ?? ""}
                onChange={(event) =>
                  change(() => setFields((current) => ({ ...current, [name]: event.target.value })))
                }
              />
            </div>
          ))}
        </div>
        <section aria-label={t("ui.previewTitle")} className="grid content-start gap-3">
          <h3 className="column-label text-muted-foreground">{t("ui.previewTitle")}</h3>
          {preview ? (
            <div className="document-sheet" data-testid="document-preview">
              <h2 className="section-title mb-3">{preview.title}</h2>
              <div dangerouslySetInnerHTML={{ __html: preview.html }} />
              <div className="mt-10 w-60 border-t pt-1 text-center text-xs">
                <p className="font-semibold">{preview.signature.name}</p>
                {preview.signature.registration ? <p>{preview.signature.registration}</p> : null}
              </div>
              {preview.footer ? (
                <p className="text-muted-foreground mt-8 border-t pt-2 text-xs">{preview.footer}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("ui.previewLoading")}</p>
          )}
          {confirming && preview && preview.missing.length > 0 ? (
            <Alert variant="warning">
              <ul className="list-disc pl-4">
                {preview.missing.map((item) => (
                  <li key={item.variable}>{item.message}</li>
                ))}
              </ul>
              <span>{t("missing.question")}</span>
            </Alert>
          ) : null}
        </section>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("ui.cancel")}
        </Button>
        <Button type="button" disabled={!ready || busy || !preview} onClick={() => void generate()}>
          {confirming ? t("ui.generateAnyway") : t("ui.generatePdf")}
        </Button>
      </DialogFooter>
    </>
  );
}
