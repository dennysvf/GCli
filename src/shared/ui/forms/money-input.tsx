"use client";

import { useLocale } from "next-intl";
import type { ComponentProps } from "react";
import { formatLocale, formatMoney } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import type { CountryCode, Currency } from "@/shared/kernel/countries";
import { Input } from "@/shared/ui/components/input";
import { cn } from "@/shared/ui/utils";

// Amount typed like a cash register: digits fill from the right ("1" becomes 0,01 and "18000"
// becomes 180,00), shown with the symbol and separators of the language and the currency. Emits
// integer minor units (ADR-010, ADR-029). Nine digits keep the value a safe integer; range rules
// belong to each form.
const MAX_DIGITS = 9;

export function MoneyInput({
  value,
  onChange,
  currency,
  country,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "defaultValue" | "type"> & {
  value: number | null | undefined;
  onChange: (amountMinor: number) => void;
  currency: Currency;
  // The unit country decides the regional format (es-MX shows 1,234.56).
  country?: CountryCode | null;
}) {
  const locale = useLocale() as Locale;
  return (
    <Input
      {...props}
      className={cn("text-right", props.className)}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={
        value == null ? "" : formatMoney({ amountMinor: value, currency }, formatLocale(locale, country))
      }
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAX_DIGITS);
        onChange(digits ? Number(digits) : 0);
      }}
    />
  );
}
