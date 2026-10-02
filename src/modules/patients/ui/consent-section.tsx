"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { ConsentItem } from "../application/consents";
import { CONSENT_METHOD_LABELS, CONSENT_METHODS, type ConsentMethod } from "../domain/consent";
import { formatDateTimeBR } from "./format";

// Consent section (PRD F05 Experience): history plus "Registrar consentimento", a dialog with the
// terms version, the method and an optional signed-term file (ADR-023 upload).
export function ConsentSection({
  patientId,
  consents,
  termsVersion,
  canManage,
  actions,
}: {
  patientId: string;
  consents: ConsentItem[];
  termsVersion: number | null;
  canManage: boolean;
  actions: {
    record: (input: {
      patientId: string;
      method: ConsentMethod;
      uploadToken: string | null;
    }) => Promise<ActionResult<{ consentId: string; termsVersion: number }>>;
    openFile: (input: { consentId: string }) => Promise<ActionResult<{ url: string }>>;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<ConsentMethod>("PAPER_UPLOADED");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const record = () =>
    startTransition(async () => {
      setFileError(null);
      let uploadToken: string | null = null;
      const file = fileRef.current?.files?.[0];
      if (file) {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/patients/consent-files", { method: "POST", body });
        const uploaded = (await response.json()) as ActionResult<{ uploadToken: string }>;
        if (!uploaded.ok) {
          setFileError(uploaded.error.message);
          return;
        }
        uploadToken = uploaded.data.uploadToken;
      }
      const result = await actions.record({ patientId, method, uploadToken });
      if (handleActionResult(result, { successMessage: "Consentimento registrado." })) {
        setOpen(false);
        router.refresh();
      }
    });

  const openFile = (consentId: string) =>
    startTransition(async () => {
      const result = await actions.openFile({ consentId });
      if (result.ok) window.open(result.data.url, "_blank", "noopener");
      else toast.error(result.error.message, { duration: Infinity, closeButton: true });
    });

  return (
    <section aria-labelledby="consent-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="consent-title" className="section-title">
          Consentimento LGPD
        </h2>
        {canManage ? (
          <Button
            variant="outline"
            disabled={termsVersion === null}
            onClick={() => setOpen(true)}
            title={termsVersion === null ? "Publique os termos de privacidade antes." : undefined}
          >
            Registrar consentimento
          </Button>
        ) : null}
      </div>
      {termsVersion === null ? (
        <p className="text-muted-foreground text-sm">
          Os termos de privacidade ainda não foram publicados. O administrador publica em Configurações ›
          Termos de privacidade.
        </p>
      ) : null}
      {consents.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum consentimento registrado.</p>
      ) : (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead className="hidden md:table-cell">Registrado por</TableHead>
                <TableHead>Termo assinado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consents.map((consent) => (
                <TableRow key={consent.id}>
                  <TableCell className="tabular-nums">{formatDateTimeBR(consent.consentedAt)}</TableCell>
                  <TableCell className="tabular-nums">v{consent.termsVersion}</TableCell>
                  <TableCell>{CONSENT_METHOD_LABELS[consent.method]}</TableCell>
                  <TableCell className="hidden md:table-cell">{consent.recordedByName ?? "—"}</TableCell>
                  <TableCell>
                    {consent.fileName ? (
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        disabled={pending}
                        onClick={() => openFile(consent.id)}
                      >
                        {consent.fileName}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar consentimento</DialogTitle>
            <DialogDescription>
              Termos de privacidade versão {termsVersion}. O registro guarda a data, a forma e quem registrou.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field id="consent-method" label="Forma do consentimento">
              <Select value={method} onValueChange={(value) => setMethod(value as ConsentMethod)}>
                <SelectTrigger id="consent-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSENT_METHODS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CONSENT_METHOD_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="consent-file"
              label="Termo assinado (opcional)"
              error={fileError ?? undefined}
              hint="PDF, JPG ou PNG de até 10 MB."
            >
              <Input
                id="consent-file"
                ref={fileRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={record} disabled={pending}>
              {pending ? "Registrando..." : "Registrar consentimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
