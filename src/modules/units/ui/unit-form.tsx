"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/shared/kernel/action-result";
import { COUNTRY_LIST, countryProfile, currencyOf, type CountryCode } from "@/shared/kernel/countries";
import { formatTaxId, taxIdSpec } from "@/shared/kernel/tax-id";
import { timeZoneLabel } from "@/shared/kernel/time-zones";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { AddressFields } from "@/shared/ui/forms/address-fields";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { PhoneInput } from "@/shared/ui/forms/phone-input";
import { TaxIdInput } from "@/shared/ui/forms/tax-id-input";
import { useFormDraft } from "@/shared/ui/forms/use-form-draft";
import { LegalBanner } from "@/shared/ui/i18n/legal-banner";
import { createUnitSchema } from "../application/schemas";
import type { UnitDetails, UnitSaved } from "../application/units";

type Values = z.input<typeof createUnitSchema>;
type Parsed = z.output<typeof createUnitSchema>;

export function UnitForm({
  unit,
  defaultCountry,
  defaultTimeZone,
  readOnly = false,
  action,
}: {
  unit?: UnitDetails;
  // A new unit starts in the organization country and zone (ADR-019).
  defaultCountry: CountryCode;
  defaultTimeZone: string;
  readOnly?: boolean;
  action: (input: Parsed & { unitId?: string; version?: number }) => Promise<ActionResult<UnitSaved>>;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const initialCountry = unit?.country ?? defaultCountry;
  const defaults: Values = {
    name: unit?.name ?? "",
    country: initialCountry,
    taxId: unit?.taxId ? formatTaxId(initialCountry, unit.taxId) : "",
    timeZone: unit?.timeZone ?? defaultTimeZone,
    phone: unit?.phone ?? "",
    email: unit?.email ?? "",
    address: {
      postalCode: unit?.address.postalCode ?? "",
      street: unit?.address.street ?? "",
      number: unit?.address.number ?? "",
      complement: unit?.address.complement ?? "",
      district: unit?.address.district ?? "",
      city: unit?.address.city ?? "",
      region: unit?.address.region ?? "",
    },
  };
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: defaults,
  });
  const draft = useFormDraft(`unit-${unit?.id ?? "new"}`, form);
  const { errors } = form.formState;
  const version = unit?.version;
  const country = useWatch({ control: form.control, name: "country" }) as CountryCode;
  // The selects below ignore the "" that Radix emits while the options of a new country are not mounted
  // yet, so the default zone of the country stays selected.
  const profile = countryProfile(country);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await action(unit ? { ...values, unitId: unit.id, version } : values);
      if (handleActionResult(result, { setError: form.setError, successMessage: t("units.ui.unitSaved") })) {
        draft.clear();
        // A unit in a currency the catalog does not price yet: list the services to price (PRD F16).
        const missing = result.data.servicesWithoutPrice;
        if (missing.length > 0) {
          toast.warning(
            t("units.newCurrencyWarning", {
              count: missing.length,
              currency: result.data.currency,
              names: missing.map((service) => service.name).join(", "),
            }),
            { duration: Infinity, closeButton: true },
          );
        }
        if (!unit) router.push(`/settings/units/${result.data.unitId}?tab=horario`);
        else router.refresh();
      }
    }),
  );

  const initial = (name: "name" | "email"): string => defaults[name] ?? "";

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-4" noValidate>
      <HydratedFieldset disabled={readOnly}>
        <Field id="unit-name" label={t("common.name")} error={errors.name?.message}>
          <Input
            id="unit-name"
            readOnly={readOnly}
            defaultValue={initial("name")}
            aria-invalid={!!errors.name}
            {...form.register("name")}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="unit-country" label={t("units.country")} error={errors.country?.message}>
            <Controller
              control={form.control}
              name="country"
              render={({ field }) => (
                <Select
                  value={field.value}
                  disabled={readOnly}
                  onValueChange={(next) => {
                    field.onChange(next);
                    // Zones, tax ID and address follow the country: restart them from its defaults.
                    form.setValue("timeZone", countryProfile(next as CountryCode).defaultTimeZone);
                    form.setValue("taxId", "");
                    form.setValue("address.region", "");
                  }}
                >
                  <SelectTrigger id="unit-country" className="w-full">
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
              )}
            />
          </Field>
          <Field id="unit-currency" label={t("units.currency")}>
            <Input id="unit-currency" value={currencyOf(country)} readOnly disabled />
          </Field>
        </div>
        <LegalBanner country={country} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="unit-taxId"
            label={t("units.ui.taxIdOptional", { label: taxIdSpec(country).shortLabel })}
            error={errors.taxId?.message}
          >
            <Controller
              control={form.control}
              name="taxId"
              render={({ field }) => (
                <TaxIdInput
                  id="unit-taxId"
                  country={country}
                  readOnly={readOnly}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
          <Field id="unit-timezone" label={t("identity.ui.timeZone")} error={errors.timeZone?.message}>
            <Controller
              control={form.control}
              name="timeZone"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(next) => next && field.onChange(next)}
                  disabled={readOnly}
                >
                  <SelectTrigger id="unit-timezone" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profile.timeZones.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {timeZoneLabel(zone)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field id="unit-phone" label={t("common.phone")} error={errors.phone?.message}>
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  id="unit-phone"
                  readOnly={readOnly}
                  defaultCountry={country}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
          <Field id="unit-email" label={t("common.email")} error={errors.email?.message}>
            <Input
              id="unit-email"
              type="email"
              readOnly={readOnly}
              defaultValue={initial("email")}
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
          </Field>
        </div>
        <AddressFields
          form={form}
          idPrefix="unit"
          country={country}
          defaults={defaults.address}
          readOnly={readOnly}
        />
        {readOnly ? null : (
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? t("common.saving") : unit ? t("common.save") : t("units.ui.createUnit")}
            </Button>
          </div>
        )}
      </HydratedFieldset>
    </form>
  );
}
