import type { Metadata } from "next";
import Link from "next/link";
import { identityMessages, NewPasswordForm } from "@/modules/identity";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { resetPasswordAction } from "./actions";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Redefinir senha</h1>
        <p className="text-muted-foreground text-sm">Escolha uma nova senha para sua conta.</p>
      </div>
      {typeof token === "string" && token ? (
        <NewPasswordForm token={token} submitLabel="Redefinir senha" action={resetPasswordAction} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>{identityMessages.AUTH_LINK_INVALID}</AlertDescription>
        </Alert>
      )}
      <Link
        href="/forgot-password"
        className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
      >
        Solicitar novo link
      </Link>
    </>
  );
}
