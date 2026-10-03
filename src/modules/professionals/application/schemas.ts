import { z } from "zod";
import { COUNTRY_CODES } from "@/shared/kernel/countries/codes";
import { councilSpec } from "@/shared/kernel/countries";
import { isValidNpi } from "@/shared/kernel/id-checks";
import { PALETTE_COLORS } from "@/shared/kernel/palette";
import { documentInputSchema, phoneInputSchema } from "@/shared/kernel/person-schemas";
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

// Zod schemas shared by the professionals forms and use cases. Messages are catalog keys
// (professionals.validation.*, ADR-028), translated where they are shown.
export const PROFESSIONAL_STATUSES = ["active", "inactive", "all"] as const;
export type ProfessionalStatusFilter = (typeof PROFESSIONAL_STATUSES)[number];

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

const digitsOrNull = z
  .string()
  .nullish()
  .transform((value) => (value ?? "").replace(/\D/g, "") || null);

// One council registration of a country (PRD F16): the type, number, region and NPI rules come from
// the country profile.
const registrationSchema = z
  .object({
    country: z.enum(COUNTRY_CODES, { error: "validation.countryInvalid" }),
    councilType: z.string().trim().min(1, "professionals.validation.councilRequired"),
    councilOtherName: optionalText(COUNCIL_OTHER_NAME_MAX, "professionals.validation.councilNameTooLong"),
    number: upperOrNull,
    region: upperOrNull,
    npi: digitsOrNull,
  })
  .superRefine((value, ctx) => {
    const spec = councilSpec(value.country, value.councilType);
    if (!spec) {
      ctx.addIssue({
        code: "custom",
        path: ["councilType"],
        message: "professionals.validation.councilInvalid",
      });
      return;
    }
    const npiOnly = spec.hasNpi && spec.type === "NPI";
    if (!npiOnly) {
      if (!value.number) {
        ctx.addIssue({
          code: "custom",
          path: ["number"],
          message: "professionals.validation.numberRequired",
        });
      } else if (
        value.number.length > COUNCIL_NUMBER_MAX ||
        !(spec.numberPattern ?? /^[0-9A-Z.-]+$/).test(value.number)
      ) {
        ctx.addIssue({ code: "custom", path: ["number"], message: "professionals.validation.numberInvalid" });
      }
    }
    if (spec.regionRequired) {
      if (!value.region) {
        ctx.addIssue({
          code: "custom",
          path: ["region"],
          message: "professionals.validation.regionRequired",
        });
      } else if (spec.regions && !spec.regions.some((region) => region.code === value.region)) {
        ctx.addIssue({ code: "custom", path: ["region"], message: "professionals.validation.regionInvalid" });
      }
    }
    if (
      spec.needsName &&
      (!value.councilOtherName || value.councilOtherName.length < COUNCIL_OTHER_NAME_MIN)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["councilOtherName"],
        message: "professionals.validation.councilNameRequired",
      });
    }
    if (spec.hasNpi) {
      if ((npiOnly || value.npi) && !(value.npi && isValidNpi(value.npi))) {
        ctx.addIssue({ code: "custom", path: ["npi"], message: "professionals.validation.npiInvalid" });
      }
    }
  })
  // Fields that do not apply to the type are cleared, as the database expects.
  .transform((value) => {
    const spec = councilSpec(value.country, value.councilType);
    const npiOnly = !!spec?.hasNpi && spec.type === "NPI";
    return {
      ...value,
      councilOtherName: spec?.needsName ? value.councilOtherName : null,
      number: npiOnly ? null : value.number,
      region: spec?.regionRequired ? value.region : null,
      npi: spec?.hasNpi ? value.npi : null,
    };
  });

export type RegistrationInput = z.input<typeof registrationSchema>;

const professionalShape = {
  fullName: z
    .string({ error: "professionals.validation.fullNameRequired" })
    .trim()
    .min(FULL_NAME_MIN, "professionals.validation.fullNameRequired")
    .max(FULL_NAME_MAX, "professionals.validation.fullNameTooLong"),
  displayName: optionalText(DISPLAY_NAME_MAX, "professionals.validation.displayNameTooLong"),
  specialty: optionalText(SPECIALTY_MAX, "professionals.validation.specialtyTooLong"),
  // A professional without a council needs no registration to work in any unit (PRD F04).
  hasNoCouncil: z.boolean().default(false),
  registrations: z.array(registrationSchema).max(COUNTRY_CODES.length).default([]),
  document: documentInputSchema,
  phone: phoneInputSchema(),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value || null)
    .pipe(z.email("professionals.validation.emailInvalid").max(EMAIL_MAX).nullable()),
  color: z.enum(PALETTE_COLORS, { error: "professionals.validation.colorRequired" }),
  linkedUserId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
};

type RegistrationFields = { hasNoCouncil: boolean; registrations: { country: string }[] };

// At most one registration per country; a professional without a council keeps none.
function checkRegistrations(value: RegistrationFields, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  value.registrations.forEach((registration, index) => {
    if (seen.has(registration.country)) {
      ctx.addIssue({
        code: "custom",
        path: ["registrations", index, "country"],
        message: "professionals.validation.oneRegistrationPerCountry",
      });
    }
    seen.add(registration.country);
  });
}

function clearRegistrations<T extends RegistrationFields>(value: T): T {
  return value.hasNoCouncil ? { ...value, registrations: [] } : value;
}

export const createProfessionalSchema = z
  .object(professionalShape)
  .superRefine(checkRegistrations)
  .transform(clearRegistrations);
export const updateProfessionalSchema = z
  .object({ ...professionalShape, professionalId: z.uuid(), version: z.number().int() })
  .superRefine(checkRegistrations)
  .transform(clearRegistrations);

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

const dateString = z.string().refine(isValidDate, "professionals.validation.dateInvalid");

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

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "professionals.validation.dateTimeRequired");

export const createTimeOffSchema = z
  .object({
    professionalId: z.uuid(),
    type: z.enum(TIME_OFF_TYPES, { error: "professionals.validation.timeOffTypeRequired" }),
    allDay: z.boolean(),
    startsAt: z.string({ error: "professionals.validation.startRequired" }),
    endsAt: z.string({ error: "professionals.validation.endRequired" }),
    note: optionalText(TIME_OFF_NOTE_MAX, "professionals.validation.timeOffNoteTooLong"),
  })
  .superRefine((value, ctx) => {
    const format = value.allDay ? dateString : localDateTime;
    for (const field of ["startsAt", "endsAt"] as const) {
      const parsed = format.safeParse(value[field]);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: parsed.error.issues[0]?.message ?? "professionals.validation.dateInvalid",
        });
      } else if (!value.allDay && Number(value[field].slice(14, 16)) % 5 !== 0) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "professionals.validation.intervals.granularity",
        });
      }
    }
  });

export const deleteTimeOffSchema = z.object({ timeOffId: z.uuid() });

export type ProfessionalInput = z.input<typeof createProfessionalSchema>;
export type TimeOffInput = z.input<typeof createTimeOffSchema>;
