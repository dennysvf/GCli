import { z } from "zod";
import { normalizeCnpj } from "@/shared/kernel/cnpj";
import { BRAZIL_TIME_ZONES } from "@/shared/kernel/time-zones";
import { CLOSURE_REASON_MAX, ROOM_DESCRIPTION_MAX, ROOM_NAME_MAX, UNIT_NAME_MAX } from "../domain/limits";

// Zod schemas shared by the units forms and use cases. Messages are pt-BR.
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

// Empty strings from forms become null; values are trimmed.
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

const unitFields = {
  name: z.string().trim().min(2, "Informe o nome da unidade.").max(UNIT_NAME_MAX, "Nome muito longo."),
  // Check digits are validated by the use case (UNITS_INVALID_CNPJ).
  cnpj: z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? normalizeCnpj(value) : null)),
  timeZone: z.enum(BRAZIL_TIME_ZONES, { error: "Selecione um fuso horário." }),
  phone: z
    .string()
    .nullish()
    .transform(digitsOnly)
    .refine((value) => value === null || /^\d{10,11}$/.test(value), "Telefone inválido (com DDD)."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .nullish()
    .transform((value) => value || null)
    .refine((value) => value === null || z.email().safeParse(value).success, "E-mail inválido."),
  address: addressSchema.prefault({}),
};

export const createUnitSchema = z.object(unitFields);
export const updateUnitSchema = z.object({
  ...unitFields,
  unitId: z.uuid(),
  version: z.coerce.number().int().min(1),
});
export const setUnitActiveSchema = z.object({ unitId: z.uuid(), active: z.boolean() });

const intervalSchema = z.object({ start: z.coerce.number().int(), end: z.coerce.number().int() });
export const replaceBusinessHoursSchema = z.object({
  unitId: z.uuid(),
  days: z.array(
    z.object({ weekday: z.coerce.number().int(), open: z.boolean(), intervals: z.array(intervalSchema) }),
  ),
});

export const createRoomSchema = z.object({
  unitId: z.uuid(),
  name: z.string().trim().min(1, "Informe o nome da sala.").max(ROOM_NAME_MAX, "Nome muito longo."),
  description: optionalText(ROOM_DESCRIPTION_MAX, "Descrição muito longa."),
});
export const updateRoomSchema = createRoomSchema.omit({ unitId: true }).extend({ roomId: z.uuid() });
export const setRoomActiveSchema = z.object({ roomId: z.uuid(), active: z.boolean() });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
export const createClosureSchema = z
  .object({
    unitId: z.uuid(),
    startsOn: isoDate,
    endsOn: isoDate,
    reason: z.string().trim().min(2, "Informe o motivo.").max(CLOSURE_REASON_MAX, "Motivo muito longo."),
    confirmOverlap: z.boolean().optional().default(false),
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    path: ["endsOn"],
    message: "A data final deve ser igual ou posterior à inicial.",
  });
export const deleteClosureSchema = z.object({ closureId: z.uuid() });

export const selectUnitSchema = z.object({ unitId: z.uuid() });

export type UnitFormInput = z.input<typeof createUnitSchema>;
export type BusinessHoursInput = z.input<typeof replaceBusinessHoursSchema>;
