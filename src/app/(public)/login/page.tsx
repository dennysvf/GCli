import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { homeFor, identityMessages, SignInForm } from "@/modules/identity";
import { getRequestContext } from "@/modules/identity/next";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { signInAction } from "./actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const ctx = await getRequestContext();
  if (ctx) redirect(homeFor(ctx.user.role));

  return (
    <>
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Entrar</h1>
        <p className="text-muted-foreground text-sm">Acesse com seu e-mail e senha.</p>
      </div>
      {params.reason === "expired" ? (
        <Alert>
          <AlertDescription>{identityMessages.AUTH_UNAUTHENTICATED}</AlertDescription>
        </Alert>
      ) : null}
      {params.reset === "success" ? (
        <Alert>
          <AlertDescription>Senha redefinida. Entre com a nova senha.</AlertDescription>
        </Alert>
      ) : null}
      <SignInForm next={next} action={signInAction} />
      <Link
        href="/forgot-password"
        className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
      >
        Esqueci minha senha
      </Link>
    </>
  );
}
