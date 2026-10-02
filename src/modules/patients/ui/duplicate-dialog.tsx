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
import { formatDateBR } from "./format";
import { PATIENTS_POSSIBLE_DUPLICATE } from "../messages";

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
  return (
    <AlertDialog open={candidates !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Possível cadastro duplicado</AlertDialogTitle>
          <AlertDialogDescription>{PATIENTS_POSSIBLE_DUPLICATE}</AlertDialogDescription>
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
                  {candidate.active ? "" : " (inativo)"}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  Nascimento {formatDateBR(candidate.birthDate)} · CPF{" "}
                  {candidate.maskedCpf ?? "não informado"} · celular final {candidate.phoneEnd}
                </span>
              </span>
              <Button asChild variant="outline" size="sm">
                <Link href={`/patients/${candidate.patientId}`}>Abrir cadastro existente</Link>
              </Button>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Criando..." : "Criar mesmo assim"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
