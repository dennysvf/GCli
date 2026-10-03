"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { useFormDraft } from "@/shared/ui/forms/use-form-draft";
import { useTranslations } from "next-intl";
import { LOCALE_NAMES, SUPPORTED_LOCALES } from "@/shared/i18n/locales";
import { COUNTRY_LIST, countryProfile, type CountryCode } from "@/shared/kernel/countries";
import { timeZoneLabel } from "@/shared/kernel/time-zones";
import { formatTaxId, taxIdSpec } from "@/shared/kernel/tax-id";
import { LOGO_MAX_BYTES, SLOT_GRANULARITIES } from "../domain/policies";
import { updateOrganizationSchema } from "../application/schemas";
import type { OrganizationProfile } from "../application/organization";

type Values = z.input<typeof updateOrganizationSchema>;
type Parsed = z.output<typeof updateOrganizationSchema>;

export function OrganizationForm({
  profile,
  action,
}: {
  profile: OrganizationProfile;
  action: (input: Parsed) => Promise<ActionResult<{ version: number }>>;
}) {
  const router = useRouter();
  const tCountries = useTranslations("countries");
  const [pending, startTransition] = useTransition();
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      legalName: profile.legalName,
      tradeName: profile.tradeName ?? "",
      country: profile.country,
      defaultLocale: profile.defaultLocale,
      taxId: profile.taxId ? formatTaxId(profile.country, profile.taxId) : "",
      timeZone: profile.timeZone,
      slotGranularityMinutes: profile.slotGranularityMinutes,
      version: profile.version,
    },
  });
  // PRD F01: unsaved data survives a session expiry and is restored after signing in again.
  const draft = useFormDraft("settings-organization", form);
  const { errors } = form.formState;
  const country = useWatch({ control: form.control, name: "country" }) as CountryCode;
  const profileOfCountry = countryProfile(country);

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await action(values);
      if (handleActionResult(result, { setError: form.setError, successMessage: "Configurações salvas" })) {
        draft.clear();
        form.reset({ ...form.getValues(), version: result.data.version });
        router.refresh();
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4" noValidate>
      <HydratedFieldset>
        <input type="hidden" {...form.register("version")} />
        <Field id="legalName" label="Razão social" error={errors.legalName?.message}>
          <Input id="legalName" defaultValue={profile.legalName} {...form.register("legalName")} />
        </Field>
        <Field id="tradeName" label="Nome fantasia" error={errors.tradeName?.message}>
          <Input id="tradeName" defaultValue={profile.tradeName ?? ""} {...form.register("tradeName")} />
        </Field>
        <Field id="country" label="País da sede" error={errors.country?.message}>
          <Controller
            control={form.control}
            name="country"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(next) => {
                  field.onChange(next);
                  // The zone must belong to the country: start from its default.
                  form.setValue("timeZone", countryProfile(next as CountryCode).defaultTimeZone);
                }}
              >
                <SelectTrigger id="country" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_LIST.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {tCountries(`names.${item.code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id="defaultLocale" label="Idioma padrão" error={errors.defaultLocale?.message}>
          <Controller
            control={form.control}
            name="defaultLocale"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="defaultLocale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LOCALES.map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {LOCALE_NAMES[locale]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id="taxId" label={taxIdSpec(country).shortLabel} error={errors.taxId?.message}>
          <Input
            id="taxId"
            maxLength={24}
            {...form.register("taxId", {
              onChange: (event) => {
                event.target.value = formatTaxId(country, event.target.value);
              },
            })}
          />
        </Field>
        <Field id="timeZone" label="Fuso horário" error={errors.timeZone?.message}>
          <Controller
            control={form.control}
            name="timeZone"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="timeZone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profileOfCountry.timeZones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {timeZoneLabel(zone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id="slot" label="Intervalo da agenda" error={errors.slotGranularityMinutes?.message}>
          <Controller
            control={form.control}
            name="slotGranularityMinutes"
            render={({ field }) => (
              <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                <SelectTrigger id="slot" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLOT_GRANULARITIES.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} minutos
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </HydratedFieldset>
    </form>
  );
}

export function LogoUploader({
  logoUrl,
  uploadAction,
  removeAction,
}: {
  logoUrl: string | null;
  uploadAction: (data: FormData) => Promise<ActionResult<{ logoUrl: string | null }>>;
  removeAction: () => Promise<ActionResult<{ logoUrl: string | null }>>;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState(logoUrl);

  const upload = (file: File) => {
    if (file.size > LOGO_MAX_BYTES) {
      toast.error("Envie um logotipo PNG, JPG ou SVG de até 2 MB.", {
        duration: Infinity,
        closeButton: true,
      });
      return;
    }
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      const result = await uploadAction(data);
      if (handleActionResult(result, { successMessage: "Logotipo atualizado" })) {
        setPreview(result.data.logoUrl);
        router.refresh();
      }
    });
  };

  return (
    <div className="grid max-w-xl gap-3">
      <p className="text-sm font-medium">Logotipo</p>
      <div className="bg-muted/40 flex h-24 items-center justify-center rounded-lg border">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated route, not optimizable
          <img
            src={preview}
            alt="Logotipo da organização"
            className="max-h-20 max-w-[200px] object-contain"
          />
        ) : (
          <span className="text-muted-foreground text-sm">Nenhum logotipo</span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
          <ImageUp />
          {pending ? "Enviando..." : "Enviar logotipo"}
        </Button>
        {preview ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (handleActionResult(await removeAction(), { successMessage: "Logotipo removido" })) {
                  setPreview(null);
                  router.refresh();
                }
              })
            }
          >
            <Trash2 />
            Remover
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">PNG, JPG ou SVG de até 2 MB. Exibido em até 200×80 px.</p>
    </div>
  );
}
