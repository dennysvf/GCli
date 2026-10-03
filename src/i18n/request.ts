// next-intl request configuration, without locale routing (ADR-028): the language comes from the
// signed-in user (preference, else organization default), then the pre-sign-in cookie, then the
// browser's Accept-Language. URLs never change.
import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { registerModules } from "@/composition";
import { getRequestContext } from "@/modules/identity/next";
import { getMessages } from "@/shared/i18n/catalogs";
import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "@/shared/i18n/locales";

// Screens that show times pass the unit's zone explicitly; this is the fallback for the rest.
const FALLBACK_TIME_ZONE = "America/Sao_Paulo";

export async function resolveRequestLocale(): Promise<Locale> {
  const ctx = await getRequestContext();
  if (ctx) return ctx.locale;
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return negotiateLocale((await headers()).get("accept-language"));
}

export default getRequestConfig(async () => {
  registerModules();
  const locale = await resolveRequestLocale();
  return { locale, messages: getMessages(locale), timeZone: FALLBACK_TIME_ZONE };
});
