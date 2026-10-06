// Translator for code that runs outside React: the boundary of use cases (Server Actions, routes),
// the worker and PDFs (ADR-028). Server and client components use next-intl, over the same catalogs.
import { createTranslator as createIntlTranslator } from "use-intl/core";
import { getMessages } from "./catalogs";
import type { Locale } from "./locales";

export type TranslationParams = Record<string, string | number | Date>;

export type Translator = {
  (key: string, params?: TranslationParams): string;
  has(key: string): boolean;
};

// A missing key renders as the key itself, so a gap is visible and never throws at runtime; the
// catalog test is what keeps the three languages complete.
export function createTranslator(locale: Locale): Translator {
  const intl = createIntlTranslator({
    locale,
    messages: getMessages(locale),
    onError: () => undefined,
    getMessageFallback: ({ namespace, key }) => (namespace ? `${namespace}.${key}` : key),
  });
  const translate = (key: string, params?: TranslationParams) =>
    (intl as unknown as (key: string, values?: TranslationParams) => string)(key, params);
  translate.has = (key: string) => (intl as unknown as { has(key: string): boolean }).has(key);
  return translate;
}
