"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import type { ActionResult } from "@/shared/kernel/action-result";
import { formatCnpj } from "@/shared/kernel/cnpj";
import { BRAZIL_TIME_ZONES, timeZoneLabel } from "@/shared/kernel/time-zones";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { useFormDraft } from "@/shared/ui/forms/use-form-draft";
import { BRAZIL_STATES, createUnitSchema } from "../application/schemas";
import type { UnitDetails } from "../application/units";

type Values = z.input<typeof createUnitSchema>;
type Parsed = z.output<typeof createUnitSchema>;

function maskCep(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : (value ?? "");
}

function maskPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value ?? "";
}

export function UnitForm({
  unit,
  defaultTimeZone,
  readOnly = false,
  action,
}: {
  unit?: UnitDetails;
  defaultTimeZone: string;
  readOnly?: boolean;
  action: (
    input: Parsed & { unitId?: string; version?: number },
  ) => Promise<ActionResult<{ unitId: string; version: number }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lookingUp, setLookingUp] = useState(false);
  const defaults: Values = {
    name: unit?.name ?? "",
    cnpj: unit?.cnpj ? formatCnpj(unit.cnpj) : "",
    timeZone: (unit?.timeZone ?? defaultTimeZone) as Values["timeZone"],
    phone: maskPhone(unit?.phone),
    email: unit?.email ?? "",
    address: {
      cep: maskCep(unit?.address.cep),
      street: unit?.address.street ?? "",
      number: unit?.address.number ?? "",
      complement: unit?.address.complement ?? "",
      district: unit?.address.district ?? "",
      city: unit?.address.city ?? "",
      state: unit?.address.state ?? "",
    },
  };
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: defaults,
  });
  const draft = useFormDraft(`unit-${unit?.id ?? "new"}`, form);
  const { errors } = form.formState;
  const version = unit?.version;

  // Fills street, district, city and state from the CEP (spec F02: editable afterwards).
  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLookingUp(true);
    try {
      const response = await fetch(`/api/address/cep/${digits}`);
      if (response.status === 404) {
        toast.warning("CEP não encontrado. Preencha o endereço manualmente.");
        return;
      }
      if (!response.ok) {
        toast.warning("Não foi possível consultar o CEP agora. Preencha o endereço manualmente.");
        return;
      }
      const address = (await response.json()) as {
        street: string;
        district: string;
        city: string;
        state: string;
      };
      form.setValue("address.cep", maskCep(digits), { shouldDirty: true });
      form.setValue("address.street", address.street, { shouldDirty: true });
      form.setValue("address.district", address.district, { shouldDirty: true });
      form.setValue("address.city", address.city, { shouldDirty: true });
      form.setValue("address.state", address.state, { shouldDirty: true });
    } finally {
      setLookingUp(false);
    }
  }

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await action(unit ? { ...values, unitId: unit.id, version } : values);
      if (handleActionResult(result, { setError: form.setError, successMessage: "Unidade salva" })) {
        draft.clear();
        if (!unit) router.push(`/settings/units/${result.data.unitId}?tab=horario`);
        else router.refresh();
      }
    }),
  );

  // defaultValue makes the server-rendered HTML already show the stored values (see F01).
  const initial = (path: string): string => {
    const value = path
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], defaults);
    return typeof value === "string" ? value : "";
  };
  const text = (
    name: Parameters<typeof form.register>[0],
    id: string,
    props: Record<string, unknown> = {},
  ) => (
    <Input
      id={id}
      readOnly={readOnly}
      defaultValue={initial(name)}
      aria-invalid={!!form.getFieldState(name).error}
      {...props}
      {...form.register(name)}
    />
  );

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-4" noValidate>
      <HydratedFieldset disabled={readOnly}>
        <Field id="unit-name" label="Nome" error={errors.name?.message}>
          {text("name", "unit-name")}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="unit-cnpj" label="CNPJ (opcional)" error={errors.cnpj?.message}>
            {text("cnpj", "unit-cnpj", { placeholder: "00.000.000/0000-00", maxLength: 18 })}
          </Field>
          <Field id="unit-timezone" label="Fuso horário" error={errors.timeZone?.message}>
            <Controller
              control={form.control}
              name="timeZone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                  <SelectTrigger id="unit-timezone" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAZIL_TIME_ZONES.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {timeZoneLabel(zone)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field id="unit-phone" label="Telefone" error={errors.phone?.message}>
            {text("phone", "unit-phone", { placeholder: "(11) 3333-4444", inputMode: "tel" })}
          </Field>
          <Field id="unit-email" label="E-mail" error={errors.email?.message}>
            {text("email", "unit-email", { type: "email" })}
          </Field>
        </div>
        <fieldset className="grid gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Endereço</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id="unit-cep"
              label="CEP"
              error={errors.address?.cep?.message}
              hint={lookingUp ? "Consultando CEP..." : "O endereço é preenchido a partir do CEP."}
            >
              <Input
                id="unit-cep"
                placeholder="00000-000"
                inputMode="numeric"
                readOnly={readOnly}
                defaultValue={initial("address.cep")}
                {...form.register("address.cep", { onBlur: (event) => lookupCep(event.target.value) })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field id="unit-street" label="Logradouro" error={errors.address?.street?.message}>
                {text("address.street", "unit-street")}
              </Field>
            </div>
            <Field id="unit-number" label="Número" error={errors.address?.number?.message}>
              {text("address.number", "unit-number")}
            </Field>
            <div className="sm:col-span-2">
              <Field id="unit-complement" label="Complemento" error={errors.address?.complement?.message}>
                {text("address.complement", "unit-complement")}
              </Field>
            </div>
            <Field id="unit-district" label="Bairro" error={errors.address?.district?.message}>
              {text("address.district", "unit-district")}
            </Field>
            <Field id="unit-city" label="Cidade" error={errors.address?.city?.message}>
              {text("address.city", "unit-city")}
            </Field>
            <Field id="unit-state" label="UF" error={errors.address?.state?.message}>
              <Controller
                control={form.control}
                name="address.state"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={readOnly}>
                    <SelectTrigger id="unit-state" className="w-full">
                      <SelectValue placeholder="UF" />
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
          </div>
        </fieldset>
        {readOnly ? null : (
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : unit ? "Salvar" : "Criar unidade"}
            </Button>
          </div>
        )}
      </HydratedFieldset>
    </form>
  );
}
