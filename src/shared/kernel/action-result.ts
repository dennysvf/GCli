import { createTranslator, type Translator } from "@/shared/i18n/translator";
import type { Locale } from "@/shared/i18n/locales";
import { splitMessageKey } from "@/shared/i18n/message-key";
import type { Result } from "./result";

// Envelope returned by every Server Action (spec F01 section 5). The message is already
// translated into the requester's language (ADR-028).
export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fields?: Record<string, string>;
        details?: Record<string, unknown>;
      };
    };

// Message of an error code: the module's own catalog first (`<namespace>.errors.<CODE>`), then the
// shared one (`errors.<CODE>`), then a generic text so an unmapped code never shows as a key.
export function errorMessage(
  t: Translator,
  namespace: string,
  code: string,
  params?: Record<string, string | number>,
): string {
  for (const key of [`${namespace}.errors.${code}`, `errors.${code}`]) {
    if (t.has(key)) return t(key, params);
  }
  return t("errors.GENERIC");
}

// Field errors carry message keys (the Zod messages of ADR-028); text that is not a key is kept.
export function fieldMessages(
  t: Translator,
  fields: Record<string, string>,
  params?: Record<string, string | number>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, value]) => {
      const { key, params: own } = splitMessageKey(value);
      return [name, t.has(key) ? t(key, { ...params, ...own }) : value];
    }),
  );
}

export function toActionResult<T>(result: Result<T>, locale: Locale, namespace: string): ActionResult<T>;
export function toActionResult(
  result: Result<unknown>,
  locale: Locale,
  namespace: string,
): ActionResult<never>;
export function toActionResult<T>(result: Result<T>, locale: Locale, namespace: string): ActionResult<T> {
  if (result.ok) return { ok: true, data: result.value };
  const t = createTranslator(locale);
  const { code, fields, params, details } = result.error;
  return {
    ok: false,
    error: {
      code,
      message: errorMessage(t, namespace, code, params),
      ...(fields ? { fields: fieldMessages(t, fields, params) } : {}),
      ...(details ? { details } : {}),
    },
  };
}

// Replaces {name} placeholders in a text that is still a literal (notices not yet moved to the
// catalogs); unknown placeholders are left as they are.
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

// Kept for the notices still defined as plain maps.
export type MessageCatalog = Record<string, string>;
