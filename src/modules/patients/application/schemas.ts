import { z } from "zod";
import { countryAddressSchema, isEmptyAddress } from "@/shared/kernel/address";
import { documentInputSchema, phoneInputSchema } from "@/shared/kernel/person-schemas";
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

// Zod schemas shared by the patients forms and use cases. Messages are catalog keys
// (patients.validation.*, ADR-028), translated where they are shown.
export const PATIENT_STATUSES = ["active", "inactive", "all"] as const;
export type PatientStatusFilter = (typeof PATIENT_STATUSES)[number];

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);

const isoDate = z
  .string({ error: "patients.validation.birthDateInvalid" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "patients.validation.birthDateInvalid")
  .refine((value) => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), {
    message: "patients.validation.birthDateInvalid",
  });

const nameField = z
  .string({ error: "patients.validation.nameRequired" })
  .trim()
  .min(NAME_MIN, "patients.validation.nameRequired")
  .max(NAME_MAX, "patients.validation.nameTooLong")
  .refine(hasTwoWords, "patients.validation.nameTwoWords");

// A guardian section left empty in the form arrives as empty strings: it is treated as absent.
// When any of name, document or phone is filled, name, relationship and phone are required.
const guardianSchema = z
  .object({
    name: z
      .string()
      .trim()
      .nullish()
      .transform((value) => value || null),
    document: documentInputSchema,
    relationship: z.enum(GUARDIAN_RELATIONSHIPS).nullish(),
    phone: phoneInputSchema(),
  })
  .nullish()
  .superRefine((guardian, ctx) => {
    if (!guardian || (!guardian.name && !guardian.document && !guardian.phone)) return;
    const name = guardian.name ?? "";
    if (name.length < NAME_MIN || !hasTwoWords(name)) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "patients.validation.guardianNameTwoWords" });
    } else if (name.length > NAME_MAX) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "patients.validation.nameTooLong" });
    }
    if (!guardian.relationship) {
      ctx.addIssue({
        code: "custom",
        path: ["relationship"],
        message: "patients.validation.relationshipRequired",
      });
    }
    if (!guardian.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "validation.phoneInvalid" });
    }
  })
  .transform((guardian) =>
    !guardian || (!guardian.name && !guardian.document && !guardian.phone)
      ? null
      : {
          name: guardian.name ?? "",
          document: guardian.document,
          relationship: guardian.relationship ?? "OTHER",
          phone: guardian.phone ?? "",
        },
  );

const patientShape = {
  fullName: nameField,
  socialName: optionalText(NAME_MAX, "patients.validation.socialNameTooLong"),
  birthDate: isoDate,
  sex: z.enum(SEXES).default("NOT_INFORMED"),
  // PRD F16: country, type and number; valid for the type and unique per type in the organization.
  document: documentInputSchema,
  rg: optionalText(RG_MAX, "patients.validation.rgTooLong"),
  // PRD F05 and F16: mobile phone required, E.164, mobile in the countries that tell them apart.
  mobilePhone: phoneInputSchema({ mobile: true }).refine(
    (value) => value !== null,
    "validation.mobileInvalid",
  ),
  secondaryPhone: phoneInputSchema(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .nullish()
    .transform((value) => value || null)
    .refine((value) => value === null || (value.length <= EMAIL_MAX && z.email().safeParse(value).success), {
      message: "patients.validation.emailInvalid",
    }),
  // Generic address of a country; one with nothing but the country counts as absent.
  address: countryAddressSchema
    .nullish()
    .transform((address) => (address && !isEmptyAddress(address) ? address : null)),
  occupation: optionalText(OCCUPATION_MAX, "patients.validation.occupationTooLong"),
  referralSourceId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  observations: optionalText(OBSERVATIONS_MAX, "patients.validation.observationsTooLong"),
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
    note: optionalText(INACTIVE_NOTE_MAX, "patients.validation.noteTooLong"),
  })
  .refine((value) => value.active || !!value.reason, {
    path: ["reason"],
    message: "patients.validation.reasonRequired",
  });

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
  .min(1, "patients.validation.listNameRequired")
  .max(LIST_ITEM_NAME_MAX, "patients.validation.listNameTooLong");

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
    .min(TERMS_TEXT_MIN, "patients.validation.termsTooShort")
    .max(TERMS_TEXT_MAX, "patients.validation.termsTooLong"),
});

export const recordConsentSchema = z.object({
  patientId: z.uuid(),
  method: z.enum(CONSENT_METHODS, { error: "patients.validation.consentMethodRequired" }),
  uploadToken: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
});

export type PatientInput = z.input<typeof createPatientSchema>;
export type PatientValues = z.output<typeof createPatientSchema>;
