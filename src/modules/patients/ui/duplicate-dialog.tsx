"use client";

import Link from "next/link";
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
import type { DuplicateCandidate } from "../application/patients";
import { DOCUMENT_SPECS } from "@/shared/kernel/documents";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";

// PRD F05: the candidate records side by side, with "Abrir cadastro existente" and "Criar mesmo
// assim" (only name and birth date matches reach this dialog; a CPF match blocks the save).
export function DuplicateDialog({
  candidates,
  pending,
  onCancel,
  onConfirm,
}: {
  candidates: DuplicateCandidate[] | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations();
  const format = useFormatters();
  return (
    <AlertDialog open={candidates !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("patients.ui.possibleDuplicate")}</AlertDialogTitle>
          <AlertDialogDescription>{t("patients.ui.possibleDuplicateBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="divide-y border-y">
          {(candidates ?? []).map((candidate) => (
            <li
              key={candidate.patientId}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="grid">
                <span className="font-semibold">
                  {candidate.displayName}
                  {candidate.active ? "" : t("patients.ui.inactiveMark")}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {t("patients.ui.duplicateDetails", {
                    birthDate: format.date(candidate.birthDate),
                    document: candidate.maskedDocument
                      ? `${DOCUMENT_SPECS[candidate.maskedDocument.type].shortLabel} ${candidate.maskedDocument.display}`
                      : t("patients.ui.documentNotInformedLower"),
                    phoneEnd: candidate.phoneEnd,
                  })}
                </span>
              </span>
              <Button asChild variant="outline" size="sm">
                <Link href={`/patients/${candidate.patientId}`}>{t("patients.ui.openExisting")}</Link>
              </Button>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.back")}</AlertDialogCancel>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? t("common.creating") : t("patients.ui.createAnyway")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
