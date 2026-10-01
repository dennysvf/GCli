import type { Metadata } from "next";
import Link from "next/link";
import { identity, identityMessages, NewPasswordForm } from "@/modules/identity";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { acceptInvitationAction } from "./actions";

export const metadata: Metadata = { title: "Aceitar convite" };

export default async function InvitePage({ searchParams }: PageProps<"/invite">) {
  const { token } = await searchParams;
  const invitation = typeof token === "string" ? await identity.getInvitation(token) : null;

  if (!invitation?.ok || typeof token !== "string") {
    return (
      <>
        <h1 className="section-title">Convite</h1>
        <Alert variant="destructive">
          <AlertDescription>{identityMessages.AUTH_LINK_INVALID}</AlertDescription>
        </Alert>
        <Link
          href="/forgot-password"
          className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
        >
          Solicitar redefinição de senha
        </Link>
      </>
    );
  }

  const { name, email, organizationName } = invitation.value;
  return (
    <>
      <div className="grid gap-1">
        <h1 className="section-title">Bem-vindo ao GCli</h1>
        <p className="text-muted-foreground text-sm">
          Defina sua senha para acessar o sistema da {organizationName}.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-name">Nome</Label>
        <Input id="invite-name" value={name} readOnly disabled />
        <Label htmlFor="invite-email">E-mail</Label>
        <Input id="invite-email" value={email} readOnly disabled />
      </div>
      <NewPasswordForm token={token} submitLabel="Definir senha e entrar" action={acceptInvitationAction} />
    </>
  );
}
