import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/modules/identity";
import { requestPasswordResetAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("identity.auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("identity.auth.forgot");
  return (
    <>
      <div className="grid gap-1">
        <h1 className="section-title">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>
      <ForgotPasswordForm action={requestPasswordResetAction} />
      <Link
        href="/login"
        className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
      >
        {t("back")}
      </Link>
    </>
  );
}
