"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import type { ActionResult } from "@/shared/kernel/action-result";
import { maskCep } from "@/shared/kernel/address";
import { formatCnpj } from "@/shared/kernel/cnpj";
import { BRAZIL_TIME_ZONES, timeZoneLabel } from "@/shared/kernel/time-zones";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { AddressFields } from "@/shared/ui/forms/address-fields";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { useFormDraft } from "@/shared/ui/forms/use-form-draft";
import { createUnitSchema } from "../application/schemas";
import type { UnitDetails } from "../application/units";

type Values = z.input<typeof createUnitSchema>;
type Parsed = z.output<typeof createUnitSchema>;

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
        <AddressFields form={form} idPrefix="unit" defaults={defaults.address} readOnly={readOnly} />
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
