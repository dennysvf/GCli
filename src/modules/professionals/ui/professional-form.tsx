"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import type { ActionResult } from "@/shared/kernel/action-result";
import { COUNTRY_LIST, councilSpec, countryProfile, type CountryCode } from "@/shared/kernel/countries";
import type { PaletteColor } from "@/shared/kernel/palette";
import { Button } from "@/shared/ui/components/button";
import { Checkbox } from "@/shared/ui/components/checkbox";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { DocumentInput } from "@/shared/ui/forms/document-input";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { PhoneInput } from "@/shared/ui/forms/phone-input";
import { useFormDraft } from "@/shared/ui/forms/use-form-draft";
import { ColorPicker } from "@/shared/ui/palette/color-picker";
import type { ProfessionalDetails } from "../application/professionals";
import { createProfessionalSchema } from "../application/schemas";

type Values = z.input<typeof createProfessionalSchema>;
type Parsed = z.output<typeof createProfessionalSchema>;

export type LinkableUserOption = { id: string; name: string; email: string; roleLabel: string };

const NO_USER = "none";

// Dados tab (PRD F04 and F16): identification, one council registration per country, document,
// contact, agenda color and the optional linked user.
export function ProfessionalForm({
  professional,
  defaultColor,
  defaultCountry,
  linkableUsers,
  readOnly = false,
  action,
}: {
  professional?: ProfessionalDetails;
  defaultColor: PaletteColor;
  // The country offered first for the document and the first registration.
  defaultCountry: CountryCode;
  linkableUsers: LinkableUserOption[];
  readOnly?: boolean;
  action: (
    input: Parsed & { professionalId?: string; version?: number },
  ) => Promise<ActionResult<{ professionalId: string; version: number }>>;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const defaults: Values = {
    fullName: professional?.fullName ?? "",
    displayName: professional?.displayName ?? "",
    specialty: professional?.specialty ?? "",
    hasNoCouncil: professional?.hasNoCouncil ?? false,
    registrations: professional
      ? professional.registrations.map((item) => ({
          country: item.country,
          councilType: item.councilType,
          councilOtherName: item.councilOtherName ?? "",
          number: item.number ?? "",
          region: item.region ?? "",
          npi: item.npi ?? "",
        }))
      : [
          {
            country: defaultCountry,
            councilType: countryProfile(defaultCountry).councils[0]?.type ?? "OTHER",
            councilOtherName: "",
            number: "",
            region: "",
            npi: "",
          },
        ],
    document: professional?.document ?? {
      country: defaultCountry,
      type: countryProfile(defaultCountry).identityDocuments[0]?.type ?? "CPF",
      number: "",
    },
    phone: professional?.phone ?? "",
    email: professional?.email ?? "",
    color: professional?.color ?? defaultColor,
    linkedUserId: professional?.linkedUser?.id ?? null,
  };
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(createProfessionalSchema),
    defaultValues: defaults,
  });
  const draft = useFormDraft(`professional-${professional?.id ?? "new"}`, form);
  const { errors } = form.formState;
  const hasNoCouncil = useWatch({ control: form.control, name: "hasNoCouncil" });
  const registrations = useFieldArray({ control: form.control, name: "registrations" });
  const watched = useWatch({ control: form.control, name: "registrations" }) ?? [];
  const usedCountries = new Set(watched.map((registration) => registration.country));
  const freeCountry = COUNTRY_LIST.find((item) => !usedCountries.has(item.code));

  // The current link stays selectable even when the user no longer qualifies (spec F04).
  const current = professional?.linkedUser;
  const userOptions =
    current && !linkableUsers.some((user) => user.id === current.id)
      ? [
          ...linkableUsers,
          {
            id: current.id,
            name: current.name,
            email: "",
            roleLabel: t("professionals.ui.userNotLinkable"),
          },
        ]
      : linkableUsers;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await action(
        professional ? { ...values, professionalId: professional.id, version: professional.version } : values,
      );
      if (
        handleActionResult(result, {
          setError: form.setError,
          successMessage: t("professionals.ui.professionalSaved"),
        })
      ) {
        draft.clear();
        if (!professional) router.push(`/settings/professionals/${result.data.professionalId}?tab=services`);
        else router.refresh();
      }
    }),
  );

  const text = (
    name: "fullName" | "displayName" | "specialty" | "email",
    id: string,
    props: Record<string, unknown> = {},
  ) => (
    <Input
      id={id}
      readOnly={readOnly}
      defaultValue={(defaults[name] as string | null | undefined) ?? ""}
      aria-invalid={!!errors[name]}
      aria-describedby={errors[name] ? `${id}-error` : undefined}
      {...props}
      {...form.register(name)}
    />
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-4" noValidate>
      <HydratedFieldset disabled={readOnly}>
        <Field id="professional-full-name" label={t("common.fullName")} error={errors.fullName?.message}>
          {text("fullName", "professional-full-name", { autoComplete: "off" })}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="professional-display-name"
            label={t("professionals.ui.displayName")}
            error={errors.displayName?.message}
            hint={t("professionals.ui.displayNameHint")}
          >
            {text("displayName", "professional-display-name")}
          </Field>
          <Field
            id="professional-specialty"
            label={t("professionals.ui.specialtyOptional")}
            error={errors.specialty?.message}
          >
            {text("specialty", "professional-specialty", {
              placeholder: t("professionals.ui.specialtyPlaceholder"),
            })}
          </Field>
        </div>

        <fieldset className="grid gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">{t("professionals.ui.councilRegistration")}</legend>
          <label className="flex items-center gap-2 text-sm">
            <Controller
              control={form.control}
              name="hasNoCouncil"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  disabled={readOnly}
                />
              )}
            />
            {t("professionals.ui.noCouncil")}
          </label>
          {hasNoCouncil ? null : (
            <div className="grid gap-4">
              {registrations.fields.map((row, index) => {
                const registration = watched[index];
                const country = (registration?.country ?? defaultCountry) as CountryCode;
                const spec = registration ? councilSpec(country, registration.councilType) : undefined;
                const rowErrors = errors.registrations?.[index];
                const npiOnly = !!spec?.hasNpi && spec.type === "NPI";
                return (
                  <div key={row.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
                    <Field
                      id={`registration-${index}-country`}
                      label={t("common.country")}
                      error={rowErrors?.country?.message}
                    >
                      <Controller
                        control={form.control}
                        name={`registrations.${index}.country`}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            disabled={readOnly}
                            onValueChange={(next) => {
                              field.onChange(next);
                              // The council types and regions belong to the country.
                              form.setValue(
                                `registrations.${index}.councilType`,
                                countryProfile(next as CountryCode).councils[0]?.type ?? "OTHER",
                              );
                              form.setValue(`registrations.${index}.region`, "");
                            }}
                          >
                            <SelectTrigger id={`registration-${index}-country`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COUNTRY_LIST.filter(
                                (item) => item.code === field.value || !usedCountries.has(item.code),
                              ).map((item) => (
                                <SelectItem key={item.code} value={item.code}>
                                  {t(item.nameKey)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                    <Field
                      id={`registration-${index}-type`}
                      label={t("professionals.ui.council")}
                      error={rowErrors?.councilType?.message}
                    >
                      <Controller
                        control={form.control}
                        name={`registrations.${index}.councilType`}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(next) => next && field.onChange(next)}
                            disabled={readOnly}
                          >
                            <SelectTrigger id={`registration-${index}-type`} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countryProfile(country).councils.map((council) => (
                                <SelectItem key={council.type} value={council.type}>
                                  {t(council.labelKey)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                    {spec?.needsName ? (
                      <Field
                        id={`registration-${index}-other`}
                        label={t("professionals.ui.councilName")}
                        error={rowErrors?.councilOtherName?.message}
                      >
                        <Input
                          id={`registration-${index}-other`}
                          readOnly={readOnly}
                          maxLength={40}
                          defaultValue={row.councilOtherName ?? ""}
                          {...form.register(`registrations.${index}.councilOtherName`)}
                        />
                      </Field>
                    ) : null}
                    {npiOnly ? null : (
                      <Field
                        id={`registration-${index}-number`}
                        label={t("common.number")}
                        error={rowErrors?.number?.message}
                      >
                        <Input
                          id={`registration-${index}-number`}
                          readOnly={readOnly}
                          maxLength={20}
                          defaultValue={row.number ?? ""}
                          {...form.register(`registrations.${index}.number`)}
                        />
                      </Field>
                    )}
                    {spec?.regionRequired ? (
                      <Field
                        id={`registration-${index}-region`}
                        label={t(countryProfile(country).address.region.labelKey)}
                        error={rowErrors?.region?.message}
                      >
                        {spec.regions ? (
                          <Controller
                            control={form.control}
                            name={`registrations.${index}.region`}
                            render={({ field }) => (
                              <Select
                                value={field.value ?? ""}
                                onValueChange={(next) => next && field.onChange(next)}
                                disabled={readOnly}
                              >
                                <SelectTrigger id={`registration-${index}-region`} className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {spec.regions?.map((region) => (
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
                            id={`registration-${index}-region`}
                            readOnly={readOnly}
                            defaultValue={row.region ?? ""}
                            {...form.register(`registrations.${index}.region`)}
                          />
                        )}
                      </Field>
                    ) : null}
                    {spec?.hasNpi ? (
                      <Field id={`registration-${index}-npi`} label="NPI" error={rowErrors?.npi?.message}>
                        <Input
                          id={`registration-${index}-npi`}
                          readOnly={readOnly}
                          inputMode="numeric"
                          maxLength={10}
                          defaultValue={row.npi ?? ""}
                          {...form.register(`registrations.${index}.npi`)}
                        />
                      </Field>
                    ) : null}
                    {readOnly ? null : (
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => registrations.remove(index)}
                          aria-label={t("professionals.ui.removeRegistration")}
                        >
                          <Trash2 />
                          {t("professionals.ui.removeRegistration")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {errors.registrations?.message ? (
                <p role="alert" className="text-destructive text-sm">
                  {t(errors.registrations.message as string)}
                </p>
              ) : null}
              {readOnly || !freeCountry ? null : (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      registrations.append({
                        country: freeCountry.code,
                        councilType: freeCountry.councils[0]?.type ?? "OTHER",
                        councilOtherName: "",
                        number: "",
                        region: "",
                        npi: "",
                      })
                    }
                  >
                    <Plus />
                    {t("professionals.ui.addRegistration")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </fieldset>

        <Controller
          control={form.control}
          name="document"
          render={({ field }) => (
            <DocumentInput
              idPrefix="professional-document"
              label={t("patients.ui.documentOptional")}
              readOnly={readOnly}
              defaultCountry={defaultCountry}
              value={field.value}
              onChange={field.onChange}
              numberError={errors.document?.number?.message}
              typeError={errors.document?.type?.message}
            />
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="professional-phone" label={t("common.phoneOptional")} error={errors.phone?.message}>
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  id="professional-phone"
                  readOnly={readOnly}
                  defaultCountry={defaultCountry}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
          <Field id="professional-email" label={t("common.emailOptional")} error={errors.email?.message}>
            {text("email", "professional-email", { type: "email" })}
          </Field>
        </div>

        <Field id="professional-color" label={t("services.ui.agendaColor")} error={errors.color?.message}>
          <Controller
            control={form.control}
            name="color"
            render={({ field }) => (
              <ColorPicker
                id="professional-color"
                value={field.value}
                onChange={field.onChange}
                disabled={readOnly}
              />
            )}
          />
        </Field>

        <Field
          id="professional-user"
          label={t("professionals.ui.linkedUser")}
          error={errors.linkedUserId?.message}
          hint={t("professionals.ui.linkedUserHint")}
        >
          <Controller
            control={form.control}
            name="linkedUserId"
            render={({ field }) => (
              <Select
                value={field.value ?? NO_USER}
                onValueChange={(value) => field.onChange(value === NO_USER ? null : value)}
                disabled={readOnly}
              >
                <SelectTrigger id="professional-user" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_USER}>{t("common.none")}</SelectItem>
                  {userOptions.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.roleLabel})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        {readOnly ? null : (
          <div>
            <Button type="submit" disabled={pending}>
              {pending
                ? t("common.saving")
                : professional
                  ? t("common.saveChanges")
                  : t("professionals.ui.register")}
            </Button>
          </div>
        )}
      </HydratedFieldset>
    </form>
  );
}
