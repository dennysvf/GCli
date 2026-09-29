"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { requestPasswordResetSchema, resetPasswordSchema, signInSchema } from "../application/schemas";
import { PasswordInput, PasswordStrength } from "./password-field";

type SignInValues = z.input<typeof signInSchema>;

export function SignInForm({
  next,
  action,
}: {
  next?: string;
  action: (input: SignInValues) => Promise<ActionResult<{ redirectTo: string }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", next },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await action(values);
      if (handleActionResult(result, { setError: form.setError })) {
        router.replace(result.data.redirectTo);
        router.refresh();
      } else {
        form.resetField("password");
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field id="email" label="E-mail" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={!!errors.email}
          {...form.register("email")}
        />
      </Field>
      <Field id="password" label="Senha" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          {...form.register("password")}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

type ForgotValues = z.input<typeof requestPasswordResetSchema>;

export function ForgotPasswordForm({
  action,
}: {
  action: (input: ForgotValues) => Promise<ActionResult<{ message: string }>>;
}) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState<string | null>(null);
  const form = useForm<ForgotValues>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await action(values);
      if (handleActionResult(result, { setError: form.setError })) setSent(result.data.message);
    }),
  );

  if (sent) {
    return (
      <Alert>
        <AlertDescription>{sent}</AlertDescription>
      </Alert>
    );
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field id="email" label="E-mail" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" {...form.register("email")} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link de redefinição"}
      </Button>
    </form>
  );
}

type NewPasswordValues = z.input<typeof resetPasswordSchema>;

// Used for password reset and for invitation acceptance: token + new password + confirmation.
export function NewPasswordForm({
  token,
  submitLabel,
  action,
}: {
  token: string;
  submitLabel: string;
  action: (input: NewPasswordValues) => Promise<ActionResult<{ redirectTo: string }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const password = useWatch({ control: form.control, name: "password" });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await action(values);
      if (handleActionResult(result, { setError: form.setError })) {
        router.replace(result.data.redirectTo);
        router.refresh();
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field
        id="password"
        label="Nova senha"
        error={errors.password?.message}
        hint="Mínimo de 10 caracteres, com pelo menos uma letra e um número."
      >
        <PasswordInput id="password" aria-invalid={!!errors.password} {...form.register("password")} />
        <PasswordStrength value={password} />
      </Field>
      <Field id="confirmPassword" label="Confirme a senha" error={errors.confirmPassword?.message}>
        <PasswordInput
          id="confirmPassword"
          aria-invalid={!!errors.confirmPassword}
          {...form.register("confirmPassword")}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
