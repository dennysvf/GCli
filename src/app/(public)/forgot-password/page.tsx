import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/modules/identity";
import { requestPasswordResetAction } from "./actions";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Esqueci minha senha</h1>
        <p className="text-muted-foreground text-sm">
          Informe seu e-mail para receber um link de redefinição.
        </p>
      </div>
      <ForgotPasswordForm action={requestPasswordResetAction} />
      <Link
        href="/login"
        className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
      >
        Voltar para o login
      </Link>
    </>
  );
}
