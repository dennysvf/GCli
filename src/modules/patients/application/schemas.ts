import { z } from "zod";
import { addressSchema } from "@/shared/kernel/address";
import { CONSENT_METHODS } from "../domain/consent";
import {
  EMAIL_MAX,
  INACTIVE_NOTE_MAX,
  LIST_ITEM_NAME_MAX,
  NAME_MAX,
  NAME_MIN,
  OBSERVATIONS_MAX,
  OCCUPATION_MAX,
  RG_MAX,
  TERMS_TEXT_MAX,
  TERMS_TEXT_MIN,
} from "../domain/limits";
import { hasTwoWords } from "../domain/names";
import { GUARDIAN_RELATIONSHIPS, INACTIVE_REASONS, SEXES } from "../domain/patient-fields";

// Zod schemas shared by the patients forms and use cases. Messages are pt-BR (PRD F05).
export const PATIENT_STATUSES = ["active", "inactive", "all"] as const;
export type PatientStatusFilter = (typeof PATIENT_STATUSES)[number];

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);

const digits = z
  .string()
  .nullish()
  .transform((value) => (value ?? "").replace(/\D/g, "") || null);

const isoDate = z
  .string({ error: "Informe uma data de nascimento válida." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data de nascimento válida.")
  .refine((value) => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), {
    message: "Informe uma data de nascimento válida.",
  });

const nameField = z
  .string({ error: "Informe o nome completo." })
  .trim()
  .min(NAME_MIN, "Informe o nome completo.")
  .max(NAME_MAX, "O nome deve ter no máximo 150 caracteres.")
  .refine(hasTwoWords, "Informe nome e sobrenome.");

// A guardian section left empty in the form arrives as empty strings: treat it as absent.
const guardianSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return null;
    const filled = Object.values(value as Record<string, unknown>).some(
      (field) => typeof field === "string" && field.trim() !== "",
    );
    return filled ? value : null;
  },
  z
    .object({
      name: nameField,
      cpf: digits,
      relationship: z.enum(GUARDIAN_RELATIONSHIPS, { error: "Selecione o parentesco." }),
      phone: digits.refine(
        (value) => value !== null && /^\d{10,11}$/.test(value),
        "Informe o telefone com DDD.",
      ),
    })
    .nullable(),
);

const patientShape = {
  fullName: nameField,
  socialName: optionalText(NAME_MAX, "O nome social deve ter no máximo 150 caracteres."),
  birthDate: isoDate,
  sex: z.enum(SEXES).default("NOT_INFORMED"),
  cpf: digits,
  rg: optionalText(RG_MAX, "O RG deve ter no máximo 20 caracteres."),
  // PRD F05: mobile phone required, Brazilian format with area code.
  mobilePhone: digits.refine(
    (value) => value !== null && /^\d{2}9\d{8}$/.test(value),
    "Informe um celular com DDD.",
  ),
  secondaryPhone: digits.refine(
    (value) => value === null || /^\d{10,11}$/.test(value),
    "Telefone inválido (com DDD).",
  ),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .nullish()
    .transform((value) => value || null)
    .refine((value) => value === null || (value.length <= EMAIL_MAX && z.email().safeParse(value).success), {
      message: "Informe um e-mail válido.",
    }),
  address: addressSchema.prefault({}),
  occupation: optionalText(OCCUPATION_MAX, "A profissão deve ter no máximo 80 caracteres."),
  referralSourceId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  observations: optionalText(OBSERVATIONS_MAX, "As observações devem ter no máximo 2.000 caracteres."),
  tagIds: z
    .array(z.uuid())
    .nullish()
    .transform((ids) => [...new Set(ids ?? [])]),
  guardian: guardianSchema,
};

export const createPatientSchema = z.object({
  ...patientShape,
  mode: z.enum(["full", "quick"]).default("full"),
  confirmDuplicate: z.boolean().default(false),
});
export const updatePatientSchema = z.object({
  ...patientShape,
  patientId: z.uuid(),
  version: z.number().int(),
});

export const setPatientActiveSchema = z
  .object({
    patientId: z.uuid(),
    active: z.boolean(),
    reason: z.enum(INACTIVE_REASONS).nullish(),
    note: optionalText(INACTIVE_NOTE_MAX, "A observação deve ter no máximo 200 caracteres."),
  })
  .refine((value) => value.active || !!value.reason, { path: ["reason"], message: "Selecione o motivo." });

export const searchPatientsSchema = z.object({
  q: z.string().default(""),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  status: z.enum(PATIENT_STATUSES).catch("active").default("active"),
  limit: z.coerce.number().int().min(1).max(50).catch(20).default(20),
});

export const LIST_KINDS = ["referral-source", "tag"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

const listName = z
  .string()
  .trim()
  .min(1, "Informe o nome.")
  .max(LIST_ITEM_NAME_MAX, "Use no máximo 40 caracteres.");

export const createListItemSchema = z.object({ list: z.enum(LIST_KINDS), name: listName });
export const renameListItemSchema = z.object({ list: z.enum(LIST_KINDS), id: z.uuid(), name: listName });
export const setListItemActiveSchema = z.object({
  list: z.enum(LIST_KINDS),
  id: z.uuid(),
  active: z.boolean(),
});

export const publishTermsSchema = z.object({
  text: z
    .string()
    .trim()
    .min(TERMS_TEXT_MIN, "O texto dos termos deve ter pelo menos 50 caracteres.")
    .max(TERMS_TEXT_MAX, "O texto dos termos deve ter no máximo 20.000 caracteres."),
});

export const recordConsentSchema = z.object({
  patientId: z.uuid(),
  method: z.enum(CONSENT_METHODS, { error: "Selecione a forma do consentimento." }),
  uploadToken: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
});

export type PatientInput = z.input<typeof createPatientSchema>;
export type PatientValues = z.output<typeof createPatientSchema>;
