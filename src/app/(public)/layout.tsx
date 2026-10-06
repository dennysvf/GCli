import { getLocale } from "next-intl/server";
import type { Locale } from "@/shared/i18n/locales";
import { Card, CardContent } from "@/shared/ui/components/card";
import { LanguageSelect } from "@/shared/ui/i18n/language-select";
import { setPublicLocaleAction } from "./actions";
import { getTranslations } from "next-intl/server";

// Centered card used by sign-in and account recovery pages, with the language selector.
export default async function PublicLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  return (
    <main className="bg-background flex flex-1 items-center justify-center p-4">
      <div className="grid w-full max-w-sm gap-6">
        <p className="page-title text-center">{t("common.appName")}</p>
        <Card>
          <CardContent className="grid gap-6">{children}</CardContent>
        </Card>
        <LanguageSelect value={locale} action={setPublicLocaleAction} />
      </div>
    </main>
  );
}
