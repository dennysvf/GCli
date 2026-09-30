import { z } from "zod";
import { ROLES } from "@/shared/kernel/roles";
import { normalizeCnpj } from "@/shared/kernel/cnpj";
import {
  BRAZIL_TIME_ZONES,
  checkPassword,
  PASSWORD_MAX_LENGTH,
  SLOT_GRANULARITIES,
  type PasswordProblem,
} from "../domain/policies";

// Zod schemas shared by forms (react-hook-form) and use cases. Messages are pt-BR.
const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  too_short: "A senha deve ter pelo menos 10 caracteres.",
  too_long: "A senha deve ter no máximo 128 caracteres.",
  missing_letter: "A senha deve conter pelo menos uma letra.",
  missing_digit: "A senha deve conter pelo menos um número.",
};

export const emailSchema = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .max(254, "E-mail muito longo.")
  .pipe(z.email("Informe um e-mail válido."));

export const newPasswordSchema = z.string({ error: "Informe a senha." }).superRefine((value, ctx) => {
  const problem = checkPassword(value);
  if (problem) ctx.addIssue({ code: "custom", message: PASSWORD_MESSAGES[problem] });
});

const passwordsMatch = (data: { password: string; confirmPassword: string }) =>
  data.password === data.confirmPassword;
const mismatch = { path: ["confirmPassword"], message: "As senhas não conferem." };

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha.").max(PASSWORD_MAX_LENGTH, "Senha muito longa."),
  next: z.string().max(2048).optional(),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ token: z.string().min(1), password: newPasswordSchema, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

export const acceptInvitationSchema = resetPasswordSchema;

export const roleSchema = z.enum(ROLES, { error: "Selecione um perfil." });

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome completo.").max(150, "Nome muito longo."),
  email: emailSchema,
  role: roleSchema,
});

export const userIdSchema = z.object({ userId: z.uuid() });
export const invitationIdSchema = z.object({ invitationId: z.uuid() });
export const changeRoleSchema = z.object({ userId: z.uuid(), role: roleSchema });

export const listUsersSchema = z.object({
  search: z.string().trim().max(150).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const updateOrganizationSchema = z.object({
  legalName: z.string().trim().min(2, "Informe a razão social.").max(150, "Razão social muito longa."),
  tradeName: z
    .string()
    .trim()
    .max(150, "Nome fantasia muito longo.")
    .nullish()
    .transform((value) => value || null),
  // Check digits are validated by the use case, which returns ORG_INVALID_CNPJ (spec section 5).
  cnpj: z
    .string()
    .trim()
    .nullish()
    .transform((value) => (value ? normalizeCnpj(value) : null)),
  timeZone: z.enum(BRAZIL_TIME_ZONES, { error: "Selecione um fuso horário." }),
  slotGranularityMinutes: z.coerce
    .number()
    .refine(
      (value) => (SLOT_GRANULARITIES as readonly number[]).includes(value),
      "Selecione 5, 10, 15 ou 30 minutos.",
    ),
  version: z.coerce.number().int().min(1),
});

export type UpdateOrganizationInput = z.input<typeof updateOrganizationSchema>;
