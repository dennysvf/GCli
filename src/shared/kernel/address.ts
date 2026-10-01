import { z } from "zod";

// Brazilian address shared by units (F02) and patients (F05). CEP is stored with 8 digits and the
// state as a UF; empty form strings become null.
export const BRAZIL_STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);

const digitsOnly = (value: string | null | undefined) => (value ? value.replace(/\D/g, "") : null);

export const addressSchema = z.object({
  cep: z
    .string()
    .nullish()
    .transform(digitsOnly)
    .refine((value) => value === null || /^\d{8}$/.test(value), "CEP inválido."),
  street: optionalText(150, "Logradouro muito longo."),
  number: optionalText(20, "Número muito longo."),
  complement: optionalText(80, "Complemento muito longo."),
  district: optionalText(80, "Bairro muito longo."),
  city: optionalText(80, "Cidade muito longa."),
  state: z
    .string()
    .nullish()
    .transform((value) => (value ? value.toUpperCase() : null))
    .refine(
      (value) => value === null || (BRAZIL_STATES as readonly string[]).includes(value),
      "UF inválida.",
    ),
});

export type AddressInput = z.input<typeof addressSchema>;
export type Address = z.output<typeof addressSchema>;

export function maskCep(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : (value ?? "");
}
