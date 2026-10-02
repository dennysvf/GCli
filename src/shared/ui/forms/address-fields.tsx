"use client";

import { useState } from "react";
import { Controller, type FieldValues, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { BRAZIL_STATES, maskCep, type AddressInput } from "@/shared/kernel/address";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Field } from "@/shared/ui/forms/field";

type AddressForm = { address?: AddressInput };

// Address section with CEP lookup (spec F02 section 3), shared by units (F02) and patients (F05).
// The CEP fills street, district, city and state; every field stays editable.
export function AddressFields<T extends FieldValues & AddressForm>({
  form: anyForm,
  idPrefix,
  defaults,
  readOnly = false,
}: {
  form: UseFormReturn<T, unknown, unknown>;
  idPrefix: string;
  defaults: AddressInput | undefined;
  readOnly?: boolean;
}) {
  // The section only touches `address.*`, so it works on the narrower form type.
  const form = anyForm as unknown as UseFormReturn<AddressForm, unknown, unknown>;
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

  type Name = "street" | "number" | "complement" | "district" | "city";
  const text = (name: Name, props: Record<string, unknown> = {}) => (
    <Input
      id={id(name)}
      readOnly={readOnly}
      defaultValue={defaults?.[name] ?? ""}
      aria-invalid={!!errors?.[name]}
      {...props}
      {...form.register(`address.${name}`)}
    />
  );

  return (
    <fieldset className="grid gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">Endereço</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id={id("cep")}
          label="CEP"
          error={errors?.cep?.message}
          hint={lookingUp ? "Consultando CEP..." : "O endereço é preenchido a partir do CEP."}
        >
          <Input
            id={id("cep")}
            placeholder="00000-000"
            inputMode="numeric"
            readOnly={readOnly}
            defaultValue={maskCep(defaults?.cep)}
            {...form.register("address.cep", { onBlur: (event) => lookupCep(event.target.value) })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field id={id("street")} label="Logradouro" error={errors?.street?.message}>
            {text("street")}
          </Field>
        </div>
        <Field id={id("number")} label="Número" error={errors?.number?.message}>
          {text("number")}
        </Field>
        <div className="sm:col-span-2">
          <Field id={id("complement")} label="Complemento" error={errors?.complement?.message}>
            {text("complement")}
          </Field>
        </div>
        <Field id={id("district")} label="Bairro" error={errors?.district?.message}>
          {text("district")}
        </Field>
        <Field id={id("city")} label="Cidade" error={errors?.city?.message}>
          {text("city")}
        </Field>
        <Field id={id("state")} label="UF" error={errors?.state?.message}>
          <Controller
            control={form.control}
            name="address.state"
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id={id("state")} className="w-full">
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
  );
}
