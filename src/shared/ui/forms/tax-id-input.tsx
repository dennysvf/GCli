"use client";

import type { ComponentProps } from "react";
import type { CountryCode } from "@/shared/kernel/countries";
import { formatTaxId } from "@/shared/kernel/tax-id";
import { Input } from "@/shared/ui/components/input";

// Tax ID of a country typed with its mask ("00.000.000/0000-00", "12-3456789"). Emits what is
// typed; the form schema and the use case validate the check digits.
export function TaxIdInput({
  country,
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "defaultValue" | "type"> & {
  country: CountryCode;
  value: string | null | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      autoComplete="off"
      maxLength={24}
      value={formatTaxId(country, value ?? "")}
      onChange={(event) => onChange(formatTaxId(country, event.target.value))}
    />
  );
}
