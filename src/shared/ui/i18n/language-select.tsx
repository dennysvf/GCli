"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_NAMES, SUPPORTED_LOCALES, isLocale, type Locale } from "@/shared/i18n/locales";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";

// Language picker shared by pages without a session (the choice is kept in a cookie, ADR-028).
// Names are written in their own language so a person can always find theirs.
export function LanguageSelect({
  value,
  action,
}: {
  value: Locale;
  action: (locale: Locale) => Promise<void>;
}) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-center gap-2">
      <Label htmlFor="language-select" className="text-muted-foreground text-sm font-normal">
        {t("language")}
      </Label>
      <Select
        value={value}
        disabled={pending}
        onValueChange={(next) => {
          if (!isLocale(next)) return;
          startTransition(async () => {
            await action(next);
            router.refresh();
          });
        }}
      >
        <SelectTrigger id="language-select" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LOCALES.map((locale) => (
            <SelectItem key={locale} value={locale}>
              {LOCALE_NAMES[locale]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
