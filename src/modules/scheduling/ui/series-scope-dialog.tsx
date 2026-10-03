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

export type SeriesScope = "THIS" | "THIS_AND_FOLLOWING" | "ALL_FUTURE";

const SCOPES: { value: SeriesScope; label: string; hint: string }[] = [
  { value: "THIS", label: "Somente este", hint: "Apenas esta sessão muda." },
  { value: "THIS_AND_FOLLOWING", label: "Este e os seguintes", hint: "Esta sessão e as próximas da série." },
  { value: "ALL_FUTURE", label: "Todos os futuros", hint: "Todas as sessões futuras da série." },
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
  const [scope, setScope] = useState<SeriesScope>("THIS");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Este agendamento faz parte de uma série</AlertDialogTitle>
          <AlertDialogDescription>Escolha quais sessões a alteração deve atingir.</AlertDialogDescription>
        </AlertDialogHeader>
        <fieldset className="grid gap-2">
          <legend className="sr-only">Sessões atingidas</legend>
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
                <span className="font-semibold">{option.label}</span>
                <span className="text-muted-foreground block text-xs">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button type="button" onClick={() => onChoose(scope)}>
            Continuar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
