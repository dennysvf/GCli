"use client";

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
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { TermsVersion } from "../application/terms";
import { PATIENTS_TERMS_PUBLISHED } from "../notices";
import { formatDateTimeBR } from "./format";

// Privacy terms (PRD F05): the Administrator publishes numbered versions; a new version leaves the
// patients' earlier consents pending. Published versions cannot be edited.
export function TermsPanel({
  versions,
  action,
}: {
  versions: TermsVersion[];
  action: (input: { text: string }) => Promise<ActionResult<{ version: number }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(versions[0]?.text ?? "");
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);

  const publish = () =>
    startTransition(async () => {
      setConfirming(false);
      setError(undefined);
      const result = await action({ text });
      if (!result.ok && result.error.fields?.text) {
        setError(result.error.fields.text);
        return;
      }
      if (handleActionResult(result, { successMessage: PATIENTS_TERMS_PUBLISHED })) router.refresh();
    });

  return (
    <div className="grid max-w-3xl gap-6">
      <Field
        id="terms-text"
        label={
          versions.length > 0 ? `Texto da nova versão (atual: v${versions[0]?.version})` : "Texto dos termos"
        }
        error={error}
        hint="Entre 50 e 20.000 caracteres. Versões publicadas não podem ser alteradas."
      >
        <Textarea
          id="terms-text"
          className="min-h-64"
          maxLength={20000}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <div>
        <Button onClick={() => setConfirming(true)} disabled={pending || text.trim().length === 0}>
          {pending ? "Publicando..." : "Publicar nova versão"}
        </Button>
      </div>

      <section aria-labelledby="terms-history" className="grid gap-2">
        <h2 id="terms-history" className="section-title">
          Versões publicadas
        </h2>
        {versions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma versão publicada ainda.</p>
        ) : (
          <ul className="divide-y border-y">
            {versions.map((version) => (
              <li key={version.id} className="grid gap-1 py-2 text-sm">
                <span className="font-semibold">Versão {version.version}</span>
                <span className="text-muted-foreground text-xs">
                  Publicada em {formatDateTimeBR(version.publishedAt)} por {version.publishedByName ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar nova versão dos termos?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os pacientes passam a ter consentimento pendente até registrarem o consentimento desta
              versão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={publish}>
              Publicar versão {(versions[0]?.version ?? 0) + 1}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
