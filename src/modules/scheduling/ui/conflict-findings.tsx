"use client";

import { AlertTriangle, Info, OctagonX } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { Textarea } from "@/shared/ui/components/textarea";
import type { FindingDto } from "../application/booking";

// Conflicts in the booking panel (PRD F06 Experience, design system 5.11): red blocks, yellow can
// be overridden with "Confirmar encaixe" or "Justificar exceção", the patient overlap is information.
export function ConflictFindings({
  findings,
  overbookingConfirmed,
  onConfirmOverbooking,
  justification,
  onJustification,
  justificationError,
}: {
  findings: FindingDto[];
  overbookingConfirmed: boolean;
  onConfirmOverbooking: () => void;
  justification: string;
  onJustification: (text: string) => void;
  justificationError?: string;
}) {
  if (findings.length === 0) return null;
  const exceptions = findings.filter((finding) => finding.severity === "EXCEPTION");
  return (
    <div className="grid gap-2" aria-live="polite">
      {findings
        .filter((finding) => finding.severity !== "EXCEPTION")
        .map((finding, index) =>
          finding.severity === "BLOCKING" ? (
            <Alert key={`${finding.code}-${index}`} variant="destructive">
              <OctagonX aria-hidden />
              <AlertDescription>{finding.message}</AlertDescription>
            </Alert>
          ) : finding.severity === "OVERBOOKABLE" ? (
            <Alert key={`${finding.code}-${index}`} variant="warning">
              <AlertTriangle aria-hidden />
              <AlertDescription className="grid gap-2">
                <span>{finding.message}</span>
                {overbookingConfirmed ? (
                  <span className="font-semibold">Encaixe confirmado.</span>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="justify-self-start"
                    onClick={onConfirmOverbooking}
                  >
                    Confirmar encaixe
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert key={`${finding.code}-${index}`} variant="info">
              <Info aria-hidden />
              <AlertDescription>{finding.message}</AlertDescription>
            </Alert>
          ),
        )}
      {exceptions.length > 0 ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden />
          <AlertDescription className="grid gap-2">
            {exceptions.map((finding, index) => (
              <span key={`${finding.code}-${index}`}>{finding.message}</span>
            ))}
            <label htmlFor="exception-justification" className="text-foreground text-sm font-semibold">
              Justificar exceção
            </label>
            <Textarea
              id="exception-justification"
              value={justification}
              maxLength={500}
              aria-invalid={justificationError ? true : undefined}
              aria-describedby={justificationError ? "exception-justification-error" : undefined}
              onChange={(event) => onJustification(event.target.value)}
              placeholder="Por que este agendamento é uma exceção?"
            />
            {justificationError ? (
              <span id="exception-justification-error" role="alert" className="text-destructive">
                {justificationError}
              </span>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function hasBlocking(findings: FindingDto[]): boolean {
  return findings.some((finding) => finding.severity === "BLOCKING");
}

export function needsOverbooking(findings: FindingDto[]): boolean {
  return findings.some((finding) => finding.severity === "OVERBOOKABLE");
}
