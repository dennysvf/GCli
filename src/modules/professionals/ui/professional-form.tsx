"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import type { ActionResult } from "@/shared/kernel/action-result";
import type { PaletteColor } from "@/shared/kernel/palette";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { CpfInput } from "@/shared/ui/forms/cpf-input";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { useFormDraft } from "@/shared/ui/forms/use-form-draft";
import { ColorPicker } from "@/shared/ui/palette/color-picker";
import type { ProfessionalDetails } from "../application/professionals";
import { BRAZIL_STATES, createProfessionalSchema } from "../application/schemas";
import {
  COUNCIL_TYPE_LABELS,
  COUNCIL_TYPES,
  requiresOtherName,
  requiresRegistration,
} from "../domain/council";

type Values = z.input<typeof createProfessionalSchema>;
type Parsed = z.output<typeof createProfessionalSchema>;

export type LinkableUserOption = { id: string; name: string; email: string; roleLabel: string };

const NO_USER = "none";

function maskPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value ?? "";
}

// Dados tab (PRD F04 Capabilities): identification, council registration, contact, agenda color and
// the optional linked user.
export function ProfessionalForm({
  professional,
  defaultColor,
  linkableUsers,
  readOnly = false,
  action,
}: {
  professional?: ProfessionalDetails;
  defaultColor: PaletteColor;
  linkableUsers: LinkableUserOption[];
  readOnly?: boolean;
  action: (
    input: Parsed & { professionalId?: string; version?: number },
  ) => Promise<ActionResult<{ professionalId: string; version: number }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const defaults: Values = {
    fullName: professional?.fullName ?? "",
    displayName: professional?.displayName ?? "",
    specialty: professional?.specialty ?? "",
    councilType: professional?.councilType ?? "CRM",
    councilOtherName: professional?.councilOtherName ?? "",
    councilNumber: professional?.councilNumber ?? "",
    councilState: professional?.councilState ?? "",
    cpf: professional?.cpf ?? "",
    phone: maskPhone(professional?.phone),
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
  const councilType = useWatch({ control: form.control, name: "councilType" });

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
            roleLabel: "usuário inativo ou com perfil não vinculável",
          },
        ]
      : linkableUsers;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await action(
        professional ? { ...values, professionalId: professional.id, version: professional.version } : values,
      );
      if (handleActionResult(result, { setError: form.setError, successMessage: "Profissional salvo." })) {
        draft.clear();
        if (!professional) router.push(`/settings/professionals/${result.data.professionalId}?tab=services`);
        else router.refresh();
      }
    }),
  );

  const text = (
    name: "fullName" | "displayName" | "specialty" | "councilOtherName" | "councilNumber" | "phone" | "email",
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
        <Field id="professional-full-name" label="Nome completo" error={errors.fullName?.message}>
          {text("fullName", "professional-full-name", { autoComplete: "off" })}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="professional-display-name"
            label="Nome de exibição (opcional)"
            error={errors.displayName?.message}
            hint="Aparece na agenda. Ex.: Dra. Ana Lima"
          >
            {text("displayName", "professional-display-name")}
          </Field>
          <Field
            id="professional-specialty"
            label="Especialidade (opcional)"
            error={errors.specialty?.message}
          >
            {text("specialty", "professional-specialty", { placeholder: "Ex.: Fisioterapia ortopédica" })}
          </Field>
        </div>

        <fieldset className="grid gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-semibold">Registro no conselho</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="professional-council-type" label="Conselho" error={errors.councilType?.message}>
              <Controller
                control={form.control}
                name="councilType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="professional-council-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNCIL_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {COUNCIL_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            {councilType && requiresOtherName(councilType) ? (
              <Field
                id="professional-council-other"
                label="Nome do conselho"
                error={errors.councilOtherName?.message}
              >
                {text("councilOtherName", "professional-council-other", {
                  placeholder: "Ex.: CRFa",
                  maxLength: 20,
                })}
              </Field>
            ) : null}
            {councilType && requiresRegistration(councilType) ? (
              <>
                <Field id="professional-council-number" label="Número" error={errors.councilNumber?.message}>
                  {text("councilNumber", "professional-council-number", { maxLength: 15 })}
                </Field>
                <Field id="professional-council-state" label="UF" error={errors.councilState?.message}>
                  <Controller
                    control={form.control}
                    name="councilState"
                    render={({ field }) => (
                      <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={readOnly}>
                        <SelectTrigger
                          id="professional-council-state"
                          className="w-full"
                          aria-invalid={!!errors.councilState}
                        >
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {BRAZIL_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </>
            ) : null}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="professional-cpf" label="CPF (opcional)" error={errors.cpf?.message}>
            <Controller
              control={form.control}
              name="cpf"
              render={({ field }) => (
                <CpfInput
                  id="professional-cpf"
                  readOnly={readOnly}
                  aria-invalid={!!errors.cpf}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
          </Field>
          <Field id="professional-phone" label="Telefone (opcional)" error={errors.phone?.message}>
            {text("phone", "professional-phone", { placeholder: "(11) 98888-7777", inputMode: "tel" })}
          </Field>
          <Field id="professional-email" label="E-mail (opcional)" error={errors.email?.message}>
            {text("email", "professional-email", { type: "email" })}
          </Field>
        </div>

        <Field id="professional-color" label="Cor na agenda" error={errors.color?.message}>
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
          label="Usuário vinculado (opcional)"
          error={errors.linkedUserId?.message}
          hint="O usuário vinculado vê a própria agenda e registra os próprios atendimentos e ausências."
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
                  <SelectItem value={NO_USER}>Nenhum</SelectItem>
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
              {pending ? "Salvando..." : professional ? "Salvar alterações" : "Cadastrar profissional"}
            </Button>
          </div>
        )}
      </HydratedFieldset>
    </form>
  );
}
