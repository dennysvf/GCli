"use client";

import { useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";
import { COUNTRY_LIST, type CountryCode } from "@/shared/kernel/countries";
import { formatPhoneInput, PhoneNumber } from "@/shared/kernel/phone";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";

// Phone with a country code select and the national number typed with the mask of that country.
// Emits "+<code><digits>" (E.164 candidate, ADR-029); the form schema checks the number itself.
export function PhoneInput({
  value,
  onChange,
  defaultCountry,
  id,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "defaultValue" | "type"> & {
  value: string | null | undefined;
  onChange: (e164: string) => void;
  defaultCountry: CountryCode;
}) {
  const t = useTranslations("countries");
  const stored = value ? PhoneNumber.fromE164(value) : null;
  const [country, setCountry] = useState<CountryCode>(stored?.country ?? defaultCountry);
  const callingCode = COUNTRY_LIST.find((item) => item.code === country)?.phoneCode ?? "";
  const digits = stored?.nationalDigits() ?? (value ?? "").replace(/^\+\d*/, "").replace(/\D/g, "");

  const emit = (nextCountry: CountryCode, national: string) => {
    const code = COUNTRY_LIST.find((item) => item.code === nextCountry)?.phoneCode ?? "";
    onChange(national ? `+${code}${national}` : "");
  };

  return (
    <div className="flex gap-2">
      <Select
        value={country}
        disabled={props.readOnly}
        onValueChange={(next) => {
          setCountry(next as CountryCode);
          emit(next as CountryCode, digits);
        }}
      >
        <SelectTrigger aria-label={t("fields.phoneCountry")} className="w-28 shrink-0">
          <SelectValue>{`+${callingCode}`}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_LIST.map((item) => (
            <SelectItem key={item.code} value={item.code}>
              {`+${item.phoneCode} ${t(`names.${item.code}`)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        {...props}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={formatPhoneInput(digits, country)}
        onChange={(event) => emit(country, event.target.value.replace(/\D/g, "").slice(0, 15))}
      />
    </div>
  );
}
