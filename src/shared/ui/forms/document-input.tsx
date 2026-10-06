"use client";

import { useTranslations } from "next-intl";
import { COUNTRY_LIST, countryProfile, type CountryCode } from "@/shared/kernel/countries";
import { DOCUMENT_SPECS, formatDocument, type DocumentType } from "@/shared/kernel/documents";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Field } from "@/shared/ui/forms/field";

export type DocumentFormValue = { country: CountryCode; type: DocumentType; number: string };

// Identity document: country and type selects (defaulting to the unit country) plus the number,
// typed with the mask of the type. Replaces the Brazil-only CPF input (PRD F16).
export function DocumentInput({
  idPrefix,
  value,
  onChange,
  defaultCountry,
  numberError,
  typeError,
  readOnly = false,
  label,
}: {
  idPrefix: string;
  value: DocumentFormValue | null | undefined;
  onChange: (value: DocumentFormValue) => void;
  defaultCountry: CountryCode;
  numberError?: string | undefined;
  typeError?: string | undefined;
  readOnly?: boolean;
  label: string;
}) {
  const t = useTranslations();
  const country = value?.country ?? defaultCountry;
  const types = countryProfile(country).identityDocuments;
  const type =
    value?.type && DOCUMENT_SPECS[value.type].country === country ? value.type : (types[0]?.type ?? "CPF");
  const spec = DOCUMENT_SPECS[type];
  const emit = (next: Partial<DocumentFormValue>) =>
    onChange({ country, type, number: value?.number ?? "", ...next });

  return (
    <fieldset className="grid gap-3 sm:grid-cols-3">
      <legend className="sr-only">{label}</legend>
      <Field id={`${idPrefix}-country`} label={t("countries.fields.documentCountry")}>
        <Select
          value={country}
          disabled={readOnly}
          onValueChange={(next) => {
            const nextCountry = next as CountryCode;
            const first = countryProfile(nextCountry).identityDocuments[0]?.type ?? type;
            emit({ country: nextCountry, type: first, number: "" });
          }}
        >
          <SelectTrigger id={`${idPrefix}-country`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_LIST.map((item) => (
              <SelectItem key={item.code} value={item.code}>
                {t(item.nameKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id={`${idPrefix}-type`} label={t("countries.fields.documentType")} error={typeError}>
        <Select
          value={type}
          disabled={readOnly || types.length < 2}
          onValueChange={(next) => emit({ type: next as DocumentType, number: "" })}
        >
          <SelectTrigger id={`${idPrefix}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((item) => (
              <SelectItem key={item.type} value={item.type}>
                {t(item.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id={`${idPrefix}-number`} label={label} error={numberError}>
        <Input
          id={`${idPrefix}-number`}
          readOnly={readOnly}
          autoComplete="off"
          inputMode={spec.inputMode}
          aria-invalid={!!numberError}
          value={formatDocument(type, value?.number ?? "")}
          onChange={(event) => emit({ number: formatDocument(type, event.target.value) })}
        />
      </Field>
    </fieldset>
  );
}
