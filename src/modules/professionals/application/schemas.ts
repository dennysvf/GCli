import { z } from "zod";
import { PALETTE_COLORS } from "@/shared/kernel/palette";
import { COUNCIL_TYPES, requiresOtherName, requiresRegistration, type CouncilType } from "../domain/council";
import { isValidDate } from "../domain/dates";
import {
  COUNCIL_NUMBER_MAX,
  COUNCIL_OTHER_NAME_MAX,
  COUNCIL_OTHER_NAME_MIN,
  DISPLAY_NAME_MAX,
  EMAIL_MAX,
  FULL_NAME_MAX,
  FULL_NAME_MIN,
  SPECIALTY_MAX,
  TIME_OFF_NOTE_MAX,
} from "../domain/limits";
import { TIME_OFF_TYPES } from "../domain/time-offs";

// Zod schemas shared by the professionals forms and use cases. Messages are pt-BR (PRD F04).
export const PROFESSIONAL_STATUSES = ["active", "inactive", "all"] as const;
export type ProfessionalStatusFilter = (typeof PROFESSIONAL_STATUSES)[number];

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

const upperOrNull = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value.toUpperCase() : null));

const digitsOnly = z
  .string()
  .nullish()
  .transform((value) => (value ?? "").replace(/\D/g, "") || null);

const professionalShape = {
  fullName: z
    .string({ error: "Informe o nome completo." })
    .trim()
    .min(FULL_NAME_MIN, "Informe o nome completo.")
    .max(FULL_NAME_MAX, "O nome deve ter no máximo 150 caracteres."),
  displayName: optionalText(DISPLAY_NAME_MAX, "O nome de exibição deve ter no máximo 60 caracteres."),
  specialty: optionalText(SPECIALTY_MAX, "A especialidade deve ter no máximo 100 caracteres."),
  councilType: z.enum(COUNCIL_TYPES, { error: "Selecione o conselho." }),
  councilOtherName: optionalText(
    COUNCIL_OTHER_NAME_MAX,
    "O nome do conselho deve ter no máximo 20 caracteres.",
  ),
  councilNumber: upperOrNull,
  councilState: upperOrNull,
  cpf: digitsOnly,
  phone: digitsOnly,
  email: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null)
    .pipe(z.email("Informe um e-mail válido.").max(EMAIL_MAX).nullable()),
  color: z.enum(PALETTE_COLORS, { error: "Selecione uma cor." }),
  linkedUserId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
};

type CouncilFields = {
  councilType: CouncilType;
  councilOtherName: string | null;
  councilNumber: string | null;
  councilState: string | null;
  phone: string | null;
};

// PRD F04: council number and state are required when the type is not "none".
function checkCouncil(value: CouncilFields, ctx: z.RefinementCtx): void {
  if (requiresRegistration(value.councilType)) {
    if (!value.councilNumber) {
      ctx.addIssue({ code: "custom", path: ["councilNumber"], message: "Informe o número do conselho." });
    } else if (
      value.councilNumber.length > COUNCIL_NUMBER_MAX ||
      !/^[0-9A-Z.-]+$/.test(value.councilNumber)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["councilNumber"],
        message: "Use até 15 letras, números, ponto ou hífen.",
      });
    }
    if (!value.councilState) {
      ctx.addIssue({ code: "custom", path: ["councilState"], message: "Informe a UF do conselho." });
    } else if (!(BRAZIL_STATES as readonly string[]).includes(value.councilState)) {
      ctx.addIssue({ code: "custom", path: ["councilState"], message: "Selecione uma UF válida." });
    }
  }
  if (
    requiresOtherName(value.councilType) &&
    (!value.councilOtherName || value.councilOtherName.length < COUNCIL_OTHER_NAME_MIN)
  ) {
    ctx.addIssue({ code: "custom", path: ["councilOtherName"], message: "Informe o nome do conselho." });
  }
  if (value.phone && !/^\d{10,11}$/.test(value.phone)) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Informe um telefone com DDD." });
  }
}

// Fields that do not apply to the chosen council type are cleared, as the database requires.
function clearUnusedCouncilFields<T extends CouncilFields>(value: T): T {
  return {
    ...value,
    councilOtherName: requiresOtherName(value.councilType) ? value.councilOtherName : null,
    councilNumber: requiresRegistration(value.councilType) ? value.councilNumber : null,
    councilState: requiresRegistration(value.councilType) ? value.councilState : null,
  };
}

export const createProfessionalSchema = z
  .object(professionalShape)
  .superRefine(checkCouncil)
  .transform(clearUnusedCouncilFields);
export const updateProfessionalSchema = z
  .object({ ...professionalShape, professionalId: z.uuid(), version: z.number().int() })
  .superRefine(checkCouncil)
  .transform(clearUnusedCouncilFields);

export const setProfessionalActiveSchema = z.object({ professionalId: z.uuid(), active: z.boolean() });

export const listProfessionalsSchema = z.object({
  search: z
    .string()
    .trim()
    .max(FULL_NAME_MAX)
    .optional()
    .catch(undefined)
    .transform((value) => value || undefined),
  status: z.enum(PROFESSIONAL_STATUSES).catch("active").default("active"),
});

export const replaceEnabledServicesSchema = z.object({
  professionalId: z.uuid(),
  version: z.number().int(),
  serviceIds: z
    .array(z.uuid())
    .max(500)
    .transform((ids) => [...new Set(ids)]),
});

const dateString = z.string().refine(isValidDate, "Informe uma data válida.");

export const intervalSchema = z.object({
  unitId: z.uuid(),
  weekday: z.number().int(),
  start: z.number().int(),
  end: z.number().int(),
});

export const saveScheduleSchema = z.object({
  professionalId: z.uuid(),
  scheduleId: z.uuid().nullish(),
  version: z.number().int().nullish(),
  validFrom: dateString,
  validUntil: dateString.nullish().transform((value) => value ?? null),
  // At most 4 intervals × 7 days × 20 units (PRD F02 and F04 limits).
  intervals: z.array(intervalSchema).max(560),
});

export const deleteScheduleSchema = z.object({ scheduleId: z.uuid() });

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e hora.");

export const createTimeOffSchema = z
  .object({
    professionalId: z.uuid(),
    type: z.enum(TIME_OFF_TYPES, { error: "Selecione o tipo de ausência." }),
    allDay: z.boolean(),
    startsAt: z.string({ error: "Informe o início." }),
    endsAt: z.string({ error: "Informe o fim." }),
    note: optionalText(TIME_OFF_NOTE_MAX, "A observação deve ter no máximo 200 caracteres."),
  })
  .superRefine((value, ctx) => {
    const format = value.allDay ? dateString : localDateTime;
    for (const field of ["startsAt", "endsAt"] as const) {
      const parsed = format.safeParse(value[field]);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: parsed.error.issues[0]?.message ?? "Inválido.",
        });
      } else if (!value.allDay && Number(value[field].slice(14, 16)) % 5 !== 0) {
        ctx.addIssue({ code: "custom", path: [field], message: "Use horários em múltiplos de 5 minutos." });
      }
    }
  });

export const deleteTimeOffSchema = z.object({ timeOffId: z.uuid() });

export type ProfessionalInput = z.input<typeof createProfessionalSchema>;
export type TimeOffInput = z.input<typeof createTimeOffSchema>;
