"use client";

import type { ComponentProps } from "react";
import { formatCpf } from "@/shared/kernel/cpf";
import { Input } from "@/shared/ui/components/input";

// CPF typed with the mask applied as the user types ("000.000.000-00"); emits digits only.
// Check-digit validation is the form schema's job, so the message appears with the other errors.
export function CpfInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "defaultValue" | "type"> & {
  value: string | null | undefined;
  onChange: (digits: string) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="000.000.000-00"
      value={formatCpf(value ?? "")}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 11))}
    />
  );
}
