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
import { useTranslations } from "next-intl";

export type SeriesScope = "THIS" | "THIS_AND_FOLLOWING" | "ALL_FUTURE";

const SCOPES: { value: SeriesScope; label: string; hint: string }[] = [
  { value: "THIS", label: "scopeThis", hint: "scopeThisHint" },
  { value: "THIS_AND_FOLLOWING", label: "scopeFollowing", hint: "scopeFollowingHint" },
  { value: "ALL_FUTURE", label: "scopeAll", hint: "scopeAllHint" },
];

// PRD F06: editing or cancelling an occurrence offers "Somente este", "Este e os seguintes" or
// "Todos os futuros" (design system 5.7: consequences need a confirmation dialog).
export function SeriesScopeDialog({
  open,
  onOpenChange,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (scope: SeriesScope) => void;
}) {
  const t = useTranslations();
  const [scope, setScope] = useState<SeriesScope>("THIS");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("scheduling.ui.partOfSeries")}</AlertDialogTitle>
          <AlertDialogDescription>{t("scheduling.ui.chooseSessions")}</AlertDialogDescription>
        </AlertDialogHeader>
        <fieldset className="grid gap-2">
          <legend className="sr-only">{t("scheduling.ui.affectedSessions")}</legend>
          {SCOPES.map((option) => (
            <label key={option.value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="series-scope"
                className="mt-1"
                checked={scope === option.value}
                onChange={() => setScope(option.value)}
              />
              <span>
                <span className="font-semibold">{t(`scheduling.ui.${option.label}`)}</span>
                <span className="text-muted-foreground block text-xs">
                  {t(`scheduling.ui.${option.hint}`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <Button type="button" onClick={() => onChoose(scope)}>
            {t("common.continue")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
