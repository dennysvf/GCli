// Locale of a request (ADR-028): the signed-in user's, else the pre-sign-in cookie, else the
// browser's Accept-Language. Kept apart from request.ts so identity can use it without a cycle.
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "@/shared/i18n/locales";

export async function resolveRequestLocale(ctx: { locale: Locale } | null): Promise<Locale> {
  if (ctx) return ctx.locale;
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  return negotiateLocale((await headers()).get("accept-language"));
}
