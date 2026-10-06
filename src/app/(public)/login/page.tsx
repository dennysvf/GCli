import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { homeFor, SignInForm } from "@/modules/identity";
import { getRequestContext } from "@/modules/identity/next";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { signInAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("identity.auth.signIn");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getTranslations("identity");
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const ctx = await getRequestContext();
  if (ctx) redirect(homeFor(ctx.user.role));

  return (
    <>
      <div className="grid gap-1">
        <h1 className="section-title">{t("auth.signIn.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("auth.signIn.subtitle")}</p>
      </div>
      {params.reason === "expired" ? (
        <Alert>
          <AlertDescription>{t("errors.AUTH_UNAUTHENTICATED")}</AlertDescription>
        </Alert>
      ) : null}
      {params.reset === "success" ? (
        <Alert>
          <AlertDescription>{t("auth.signIn.passwordReset")}</AlertDescription>
        </Alert>
      ) : null}
      <SignInForm next={next} action={signInAction} />
      <Link
        href="/forgot-password"
        className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
      >
        {t("auth.signIn.forgot")}
      </Link>
    </>
  );
}
