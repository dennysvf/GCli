import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { identity, NewPasswordForm } from "@/modules/identity";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { acceptInvitationAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("identity.auth.invite");
  return { title: t("title") };
}

export default async function InvitePage({ searchParams }: PageProps<"/invite">) {
  const t = await getTranslations("identity");
  const { token } = await searchParams;
  const invitation = typeof token === "string" ? await identity.getInvitation(token) : null;

  if (!invitation?.ok || typeof token !== "string") {
    return (
      <>
        <h1 className="section-title">{t("auth.invite.title")}</h1>
        <Alert variant="destructive">
          <AlertDescription>{t("errors.AUTH_LINK_INVALID")}</AlertDescription>
        </Alert>
        <Link
          href="/forgot-password"
          className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
        >
          {t("auth.invite.requestReset")}
        </Link>
      </>
    );
  }

  const { name, email, organizationName } = invitation.value;
  return (
    <>
      <div className="grid gap-1">
        <h1 className="section-title">{t("auth.invite.welcome")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("auth.invite.subtitle", { organization: organizationName })}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-name">{t("auth.invite.name")}</Label>
        <Input id="invite-name" value={name} readOnly disabled />
        <Label htmlFor="invite-email">{t("auth.email")}</Label>
        <Input id="invite-email" value={email} readOnly disabled />
      </div>
      <NewPasswordForm token={token} submitLabel={t("auth.invite.submit")} action={acceptInvitationAction} />
    </>
  );
}
