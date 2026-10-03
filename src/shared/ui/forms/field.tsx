"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Label } from "@/shared/ui/components/label";

// Label + control + error message, with the ARIA wiring screen readers need. Validation messages
// from the shared Zod schemas are message keys (ADR-028): a value that is a catalog key is
// translated here, while text already translated by the server is shown as it is.
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations();
  const message = error && t.has(error) ? t(error) : error;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? <div className="text-muted-foreground text-xs">{hint}</div> : null}
      {message ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
