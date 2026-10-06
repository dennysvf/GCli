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
import { Label } from "@/shared/ui/components/label";
import { Stamp } from "@/shared/ui/components/stamp";
import { Textarea } from "@/shared/ui/components/textarea";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { ClinicalRecord } from "../application/queries";
import { ALERT_MAX_CHARACTERS } from "../domain/limits";
import type { RecordActions } from "./record-actions";

// Patient header of the record (PRD F07 Experience): name, age and the clinical alert as a stamp.
export function RecordHeader({
  header,
  canWrite,
  actions,
}: {
  header: ClinicalRecord["header"];
  canWrite: boolean;
  actions: RecordActions;
}) {
  const t = useTranslations();
  const format = useFormatters();
  const [alert, setAlert] = useState(header.alert);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(header.alert.text);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const result = await actions.updateAlert({
        patientId: header.patientId,
        text: draft,
        version: alert.version,
      });
      if (handleActionResult(result, { successMessage: t("clinicalRecords.ui.alertsToast") })) {
        setAlert(result.data);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("clinicalRecords.ui.patientHeader")} className="grid gap-2">
      <h2 className="section-title">{header.displayName}</h2>
      {header.age !== null ? (
        <p className="text-muted-foreground text-xs">
          {t("clinicalRecords.ui.age", { age: format.number(header.age) })}
        </p>
      ) : null}
      {alert.text ? (
        <Stamp variant="danger" className="h-auto w-fit max-w-full py-0.5 whitespace-normal">
          {t("clinicalRecords.ui.alertStamp", { text: alert.text })}
        </Stamp>
      ) : null}
      {canWrite ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => {
              setDraft(alert.text);
              setOpen(true);
            }}
          >
            {t("clinicalRecords.ui.editAlerts")}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("clinicalRecords.ui.alertsTitle")}</DialogTitle>
                <DialogDescription>{t("clinicalRecords.ui.alertsHint")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-1">
                <Label htmlFor="clinical-alert">{t("clinicalRecords.ui.alertsLabel")}</Label>
                <Textarea
                  id="clinical-alert"
                  value={draft}
                  maxLength={ALERT_MAX_CHARACTERS}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  {t("clinicalRecords.ui.characterCount", {
                    count: format.number(Array.from(draft).length),
                    max: format.number(ALERT_MAX_CHARACTERS),
                  })}
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  {t("clinicalRecords.ui.cancel")}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
                  {t("clinicalRecords.ui.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </section>
  );
}
