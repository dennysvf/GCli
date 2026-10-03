import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NewPasswordForm } from "@/modules/identity";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { resetPasswordAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("identity.auth.reset");
  return { title: t("title") };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const t = await getTranslations("identity");
  const { token } = await searchParams;

  return (
    <>
      <div className="grid gap-1">
        <h1 className="section-title">{t("auth.reset.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("auth.reset.subtitle")}</p>
      </div>
      {typeof token === "string" && token ? (
        <NewPasswordForm token={token} submitLabel={t("auth.reset.submit")} action={resetPasswordAction} />
      ) : (
        <Alert variant="destructive">
          <AlertDescription>{t("errors.AUTH_LINK_INVALID")}</AlertDescription>
        </Alert>
      )}
      <Link
        href="/forgot-password"
        className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
      >
        {t("auth.reset.newLink")}
      </Link>
    </>
  );
}
