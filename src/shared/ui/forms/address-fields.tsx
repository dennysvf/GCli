"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, type FieldValues, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { AddressFieldsInput } from "@/shared/kernel/address";
import { countryProfile, type CountryCode } from "@/shared/kernel/countries";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Field } from "@/shared/ui/forms/field";

// The address of a form may also be null (a patient without one) and carry its country.
type AddressForm = { address?: (AddressFieldsInput & { country?: string }) | null | undefined };

// Address section driven by the country profile (PRD F16): fields, labels, postal code pattern and
// the region list come from the profile. The Brazilian CEP lookup fills street, district, city and
// state; every field stays editable. Shared by units (F02) and patients (F05).
export function AddressFields<T extends FieldValues & AddressForm>({
  form: anyForm,
  idPrefix,
  country,
  defaults,
  readOnly = false,
}: {
  form: UseFormReturn<T, unknown, unknown>;
  idPrefix: string;
  country: CountryCode;
  defaults: AddressFieldsInput | null | undefined;
  readOnly?: boolean;
}) {
  // The section only touches `address.*`, so it works on the narrower form type.
  const form = anyForm as unknown as UseFormReturn<AddressForm, unknown, unknown>;
  const t = useTranslations();
  const profile = countryProfile(country).address;
  const errors = form.formState.errors.address;
  const [lookingUp, setLookingUp] = useState(false);
  const id = (name: string) => `${idPrefix}-${name}`;

  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLookingUp(true);
    try {
      const response = await fetch(`/api/address/cep/${digits}`);
      if (response.status === 404) {
        toast.warning(t("countries.address.cepNotFound"));
        return;
      }
      if (!response.ok) {
        toast.warning(t("countries.address.cepUnavailable"));
        return;
      }
      const found = (await response.json()) as {
        street: string;
        district: string;
        city: string;
        state: string;
      };
      form.setValue("address.postalCode", profile.postalCode.format(digits), { shouldDirty: true });
      form.setValue("address.street", found.street, { shouldDirty: true });
      form.setValue("address.district", found.district, { shouldDirty: true });
      form.setValue("address.city", found.city, { shouldDirty: true });
      form.setValue("address.region", found.state, { shouldDirty: true });
    } finally {
      setLookingUp(false);
    }
  }

  const hasLookup = profile.postalCode.lookup === "viacep";
  const postalHint = hasLookup
    ? lookingUp
      ? t("countries.address.cepLooking")
      : t("countries.address.cepHint")
    : undefined;

  return (
    <fieldset className="grid gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{t("countries.address.title")}</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id={id("postalCode")}
          label={t(profile.postalCode.labelKey)}
          error={errors?.postalCode?.message}
          hint={postalHint}
        >
          <Input
            id={id("postalCode")}
            inputMode={hasLookup ? "numeric" : "text"}
            readOnly={readOnly}
            defaultValue={defaults?.postalCode ?? ""}
            aria-invalid={!!errors?.postalCode}
            {...form.register("address.postalCode", {
              onChange: (event) => {
                event.target.value = profile.postalCode.format(
                  profile.postalCode.normalize(event.target.value),
                );
              },
              ...(hasLookup ? { onBlur: (event) => lookupCep(event.target.value) } : {}),
            })}
          />
        </Field>
        {profile.fields.map((field) => (
          <div key={field.name} className={field.name === "street" ? "sm:col-span-2" : undefined}>
            <Field id={id(field.name)} label={t(field.labelKey)} error={errors?.[field.name]?.message}>
              <Input
                id={id(field.name)}
                readOnly={readOnly}
                defaultValue={defaults?.[field.name] ?? ""}
                aria-invalid={!!errors?.[field.name]}
                {...form.register(`address.${field.name}`)}
              />
            </Field>
          </div>
        ))}
        <Field id={id("region")} label={t(profile.region.labelKey)} error={errors?.region?.message}>
          {profile.region.regions ? (
            <Controller
              control={form.control}
              name="address.region"
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(next) => next && field.onChange(next)}
                  disabled={readOnly}
                >
                  <SelectTrigger id={id("region")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profile.region.regions?.map((region) => (
                      <SelectItem key={region.code} value={region.code}>
                        {region.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          ) : (
            <Input
              id={id("region")}
              readOnly={readOnly}
              defaultValue={defaults?.region ?? ""}
              {...form.register("address.region")}
            />
          )}
        </Field>
      </div>
    </fieldset>
  );
}
