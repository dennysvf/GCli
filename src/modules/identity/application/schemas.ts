import { z } from "zod";
import { SUPPORTED_LOCALES } from "@/shared/i18n/locales";
import { ROLES } from "@/shared/kernel/roles";
import { COUNTRY_CODES } from "@/shared/kernel/countries/codes";
import { isTimeZoneOf } from "@/shared/kernel/countries";
import {
  checkPassword,
  PASSWORD_MAX_LENGTH,
  SLOT_GRANULARITIES,
  type PasswordProblem,
} from "../domain/policies";

// Zod schemas shared by forms (react-hook-form) and use cases. Messages are catalog keys
// (identity.validation.*, ADR-028), translated where they are shown.
const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  too_short: "identity.validation.passwordTooShort",
  too_long: "identity.validation.passwordTooLong",
  missing_letter: "identity.validation.passwordMissingLetter",
  missing_digit: "identity.validation.passwordMissingDigit",
};

export const emailSchema = z
  .string({ error: "identity.validation.emailRequired" })
  .trim()
  .toLowerCase()
  .max(254, "identity.validation.emailTooLong")
  .pipe(z.email("identity.validation.emailInvalid"));

export const newPasswordSchema = z
  .string({ error: "identity.validation.passwordRequired" })
  .superRefine((value, ctx) => {
    const problem = checkPassword(value);
    if (problem) ctx.addIssue({ code: "custom", message: PASSWORD_MESSAGES[problem] });
  });

const passwordsMatch = (data: { password: string; confirmPassword: string }) =>
  data.password === data.confirmPassword;
const mismatch = { path: ["confirmPassword"], message: "identity.validation.passwordMismatch" };

export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "identity.validation.passwordRequired")
    .max(PASSWORD_MAX_LENGTH, "identity.validation.passwordTooLong"),
  next: z.string().max(2048).optional(),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ token: z.string().min(1), password: newPasswordSchema, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

export const acceptInvitationSchema = resetPasswordSchema;

// Message keys, not text: the boundary translates them (ADR-028).
export const localeSchema = z.enum(SUPPORTED_LOCALES, { error: "validation.localeInvalid" });
export const setUserLocaleSchema = z.object({ locale: localeSchema });

export const roleSchema = z.enum(ROLES, { error: "identity.validation.roleRequired" });

export const inviteUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "identity.validation.nameRequired")
    .max(150, "identity.validation.nameTooLong"),
  email: emailSchema,
  role: roleSchema,
  // Language of the invitation email; omitted means the organization default.
  locale: localeSchema.optional(),
});

export const userIdSchema = z.object({ userId: z.uuid() });
export const invitationIdSchema = z.object({ invitationId: z.uuid() });
export const changeRoleSchema = z.object({ userId: z.uuid(), role: roleSchema });

export const listUsersSchema = z.object({
  search: z.string().trim().max(150).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const updateOrganizationSchema = z
  .object({
    legalName: z
      .string()
      .trim()
      .min(2, "identity.validation.legalNameRequired")
      .max(150, "identity.validation.legalNameTooLong"),
    tradeName: z
      .string()
      .trim()
      .max(150, "identity.validation.tradeNameTooLong")
      .nullish()
      .transform((value) => value || null),
    country: z.enum(COUNTRY_CODES, { error: "validation.countryInvalid" }),
    defaultLocale: localeSchema,
    // Check digits are validated by the use case against the country's tax ID (TAX_ID_INVALID).
    taxId: z
      .string()
      .trim()
      .nullish()
      .transform((value) => value || null),
    timeZone: z.string().min(1, "identity.validation.timeZoneRequired"),
    slotGranularityMinutes: z.coerce
      .number()
      .refine(
        (value) => (SLOT_GRANULARITIES as readonly number[]).includes(value),
        "identity.validation.slotInvalid",
      ),
    version: z.coerce.number().int().min(1),
  })
  // The time zone must belong to the headquarters country (PRD F16).
  .superRefine((value, ctx) => {
    if (!isTimeZoneOf(value.country, value.timeZone)) {
      ctx.addIssue({ code: "custom", path: ["timeZone"], message: "identity.validation.timeZoneRequired" });
    }
  });

export type UpdateOrganizationInput = z.input<typeof updateOrganizationSchema>;
