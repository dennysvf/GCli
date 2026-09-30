"use client";

import type { ComponentProps } from "react";
import { formatCents } from "@/shared/kernel/money";
import { Input } from "@/shared/ui/components/input";

// BRL amount typed like a cash register: digits fill from the right ("1" → R$ 0,01,
// "18000" → R$ 180,00). Emits integer cents (ADR-010). Nine digits are enough for every limit
// in the PRD and keep the value a safe integer; range rules belong to each form's schema.
const MAX_DIGITS = 9;

export function MoneyInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "defaultValue" | "type"> & {
  value: number | null | undefined;
  onChange: (cents: number) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value == null ? "" : formatCents(value)}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
        onChange(digits ? Number(digits) : 0);
      }}
    />
  );
}
