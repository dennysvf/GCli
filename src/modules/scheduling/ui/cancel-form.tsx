"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { CancellationReasonItem } from "../application/cancellation-reasons";
import type { AppointmentDetails } from "../application/queries";
import { CANCELLATION_ORIGIN_LABELS, CANCELLATION_ORIGINS } from "../domain/appointment";
import type { SeriesScope } from "./series-scope-dialog";

// Cancellation (PRD F06): origin and a reason from the configurable list are required, plus an
// optional text.
export function CancelForm({
  details,
  scope,
  reasons,
  cancel,
  onCancelled,
  onBack,
}: {
  details: AppointmentDetails;
  scope: SeriesScope;
  reasons: CancellationReasonItem[];
  cancel: (input: unknown) => Promise<ActionResult<{ cancelledIds: string[]; skipped: number }>>;
  onCancelled: () => void;
  onBack: () => void;
}) {
  const [origin, setOrigin] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      setErrors({});
      const result = await cancel({
        appointmentId: details.id,
        version: details.version,
        origin: origin || undefined,
        reasonId: reasonId || undefined,
        note: note || null,
        scope,
      });
      if (!result.ok && result.error.fields) {
        setErrors(result.error.fields);
        return;
      }
      if (handleActionResult(result)) onCancelled();
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h3 className="section-title">
        {scope === "THIS"
          ? "Cancelar agendamento"
          : scope === "THIS_AND_FOLLOWING"
            ? "Cancelar esta e as próximas sessões"
            : "Cancelar todas as sessões futuras"}
      </h3>
      <Field id="cancel-origin" label="Origem" error={errors.origin}>
        <Select value={origin} onValueChange={setOrigin}>
          <SelectTrigger
            id="cancel-origin"
            className="w-full"
            aria-invalid={errors.origin ? true : undefined}
          >
            <SelectValue placeholder="Quem cancelou?" />
          </SelectTrigger>
          <SelectContent>
            {CANCELLATION_ORIGINS.map((value) => (
              <SelectItem key={value} value={value}>
                {CANCELLATION_ORIGIN_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="cancel-reason" label="Motivo" error={errors.reasonId}>
        <Select value={reasonId} onValueChange={setReasonId}>
          <SelectTrigger
            id="cancel-reason"
            className="w-full"
            aria-invalid={errors.reasonId ? true : undefined}
          >
            <SelectValue placeholder="Escolha o motivo" />
          </SelectTrigger>
          <SelectContent>
            {reasons.map((reason) => (
              <SelectItem key={reason.id} value={reason.id}>
                {reason.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="cancel-note" label="Detalhes (opcional)" error={errors.note}>
        <Textarea
          id="cancel-note"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Cancelando..." : "Cancelar agendamento"}
        </Button>
      </div>
    </form>
  );
}
