"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/components/alert-dialog";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import type { ClosureItem } from "../application/closures";

type CreateInput = {
  unitId: string;
  startsOn: string;
  endsOn: string;
  reason: string;
  confirmOverlap?: boolean;
};

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function ClosuresPanel({
  unitId,
  closures,
  today,
  readOnly = false,
  actions,
}: {
  unitId: string;
  closures: ClosureItem[];
  today: string;
  readOnly?: boolean;
  actions: {
    create: (
      input: CreateInput,
    ) => Promise<ActionResult<{ closureId: string; overlappingAppointments: number }>>;
    remove: (input: { closureId: string }) => Promise<ActionResult<unknown>>;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ startsOn: today, endsOn: today, reason: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const submit = (confirmOverlap: boolean) =>
    startTransition(async () => {
      setFieldErrors({});
      const result = await actions.create({ unitId, ...values, confirmOverlap });
      // PRD F02: appointments in the period require explicit confirmation before saving.
      if (!result.ok && result.error.code === "UNITS_CLOSURE_CONFIRMATION_REQUIRED") {
        setConfirmation(result.error.message);
        return;
      }
      if (!result.ok && result.error.fields) {
        setFieldErrors(result.error.fields);
        return;
      }
      setConfirmation(null);
      if (handleActionResult(result, { successMessage: "Fechamento registrado" })) {
        setValues({ startsOn: today, endsOn: today, reason: "" });
        router.refresh();
      }
    });

  return (
    <div className="grid max-w-3xl gap-4">
      {readOnly ? null : (
        <form
          className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            submit(false);
          }}
        >
          <HydratedFieldset>
            <Field id="closure-start" label="De" error={fieldErrors.startsOn}>
              <Input
                id="closure-start"
                type="date"
                min={today}
                value={values.startsOn}
                onChange={(event) => setValues({ ...values, startsOn: event.target.value })}
              />
            </Field>
            <Field id="closure-end" label="Até" error={fieldErrors.endsOn}>
              <Input
                id="closure-end"
                type="date"
                min={values.startsOn}
                value={values.endsOn}
                onChange={(event) => setValues({ ...values, endsOn: event.target.value })}
              />
            </Field>
            <Field id="closure-reason" label="Motivo" error={fieldErrors.reason}>
              <Input
                id="closure-reason"
                placeholder="Ex.: Feriado municipal"
                maxLength={120}
                value={values.reason}
                onChange={(event) => setValues({ ...values, reason: event.target.value })}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              Adicionar fechamento
            </Button>
          </HydratedFieldset>
        </form>
      )}

      {closures.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center">
          Nenhum fechamento programado.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Motivo</TableHead>
                {readOnly ? null : <TableHead className="w-16" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {closures.map((closure) => (
                <TableRow key={closure.id}>
                  <TableCell>
                    {closure.startsOn === closure.endsOn
                      ? brDate(closure.startsOn)
                      : `${brDate(closure.startsOn)} a ${brDate(closure.endsOn)}`}
                  </TableCell>
                  <TableCell>{closure.reason}</TableCell>
                  {readOnly ? null : (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover fechamento ${closure.reason}`}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            if (
                              handleActionResult(await actions.remove({ closureId: closure.id }), {
                                successMessage: "Fechamento removido",
                              })
                            ) {
                              router.refresh();
                            }
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Há agendamentos neste período</AlertDialogTitle>
            <AlertDialogDescription>{confirmation}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => submit(true)}>Registrar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
