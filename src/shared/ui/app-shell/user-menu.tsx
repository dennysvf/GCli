"use client";

import { clearDeviceData } from "./device-data";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { LOCALE_NAMES, SUPPORTED_LOCALES, isLocale, type Locale } from "@/shared/i18n/locales";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Avatar, AvatarFallback } from "@/shared/ui/components/avatar";
import { Button } from "@/shared/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/components/dropdown-menu";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : ""}`.toUpperCase();
}

export function UserMenu({
  name,
  email,
  role,
  locale,
  signOutAction,
  setLocaleAction,
  extraItems,
}: {
  name: string;
  email: string;
  role: string;
  locale: Locale;
  signOutAction: () => Promise<void>;
  setLocaleAction: (locale: Locale) => Promise<ActionResult<{ locale: Locale }>>;
  // Entries other modules add above "Sair" (the approval PIN of F09).
  extraItems?: ReactNode;
}) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeLocale = (next: string) => {
    if (!isLocale(next) || next === locale) return;
    startTransition(async () => {
      if (handleActionResult(await setLocaleAction(next))) router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label={t("userMenu")}>
          <Avatar className="size-7">
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid">
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
          <span className="text-muted-foreground text-xs font-normal">
            {t.has(`roles.${role}`) ? t(`roles.${role}`) : role}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {t("language")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={changeLocale}>
          {SUPPORTED_LOCALES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} disabled={pending}>
              {LOCALE_NAMES[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {extraItems ? (
          <>
            <DropdownMenuSeparator />
            {extraItems}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <form action={signOutAction} onSubmit={clearDeviceData}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut />
              {t("signOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
