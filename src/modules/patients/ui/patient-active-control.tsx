"use client";

import { useRouter } from "next/navigation";
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
} from "@/shared/ui/components/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { INACTIVE_REASONS, type InactiveReason } from "../domain/patient-fields";
import { useTranslations } from "next-intl";

// PRD F05: deactivation (deceased, moved…) hides the patient from booking searches and keeps the
// record; it is blocked while future appointments exist.
export function PatientActiveControl({
  patientId,
  active,
  action,
}: {
  patientId: string;
  active: boolean;
  action: (input: {
    patientId: string;
    active: boolean;
    reason?: InactiveReason;
    note?: string;
  }) => Promise<ActionResult<{ active: boolean }>>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<InactiveReason>("MOVED");
  const [note, setNote] = useState("");

  const run = (nextActive: boolean) =>
    startTransition(async () => {
      const result = await action(
        nextActive ? { patientId, active: true } : { patientId, active: false, reason, note },
      );
      if (
        handleActionResult(result, {
          successMessage: nextActive
            ? t("patients.ui.patientReactivated")
            : t("patients.ui.patientInactivated"),
        })
      ) {
        setOpen(false);
        router.refresh();
      }
    });

  if (!active) {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(true)}>
        {t("patients.ui.reactivatePatient")}
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        {t("patients.ui.inactivatePatient")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("patients.ui.inactivatePatient")}</DialogTitle>
            <DialogDescription>{t("patients.ui.inactivateHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field id="inactive-reason" label={t("common.reason")}>
              <Select value={reason} onValueChange={(value) => setReason(value as InactiveReason)}>
                <SelectTrigger id="inactive-reason" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INACTIVE_REASONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`patients.ui.inactiveReasons.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="inactive-note" label={t("common.noteOptional")}>
              <Textarea
                id="inactive-note"
                maxLength={200}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(false)}>
              {pending ? t("patients.ui.inactivating") : t("patients.ui.inactivatePatient")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
