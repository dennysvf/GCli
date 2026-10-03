"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/shared/i18n/locales";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Pre-sign-in language choice (ADR-028). It is only a preference, so it needs no session; after
// sign-in the user's own preference wins.
export async function setPublicLocaleAction(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
