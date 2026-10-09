"use client";

import type { Currency } from "@/shared/kernel/countries/codes";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";

// Amounts in minor units are always written through the money formatter of the user's language.
export function useMoney() {
  const format = useFormatters();
  return (amountMinor: number, currency: string) =>
    format.money({ amountMinor, currency: currency as Currency });
}
