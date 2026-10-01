"use client";

import type { ComponentProps } from "react";
import { formatPhone } from "@/shared/kernel/phone";
import { Input } from "@/shared/ui/components/input";

// Brazilian phone typed with the mask applied as the user types ("(11) 98888-7777"); emits digits.
export function PhoneInput({
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
      type="tel"
      inputMode="tel"
      autoComplete="off"
      placeholder={props.placeholder ?? "(11) 98888-7777"}
      value={formatPhone(value ?? "")}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 11))}
    />
  );
}
