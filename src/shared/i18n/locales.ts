// Supported interface languages (PRD F16, ADR-028). pt-BR is the source language of the catalogs.
export const SUPPORTED_LOCALES = ["pt-BR", "en", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";

// Pre-sign-in language choice (login page). A signed-in user's preference wins over it.
export const LOCALE_COOKIE = "gcli_locale";

// Each language is written in its own language, so a person can find theirs.
export const LOCALE_NAMES: Record<Locale, string> = {
  "pt-BR": "Português (Brasil)",
  en: "English",
  es: "Español",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function localeOfTag(tag: string): Locale | null {
  const primary = tag.toLowerCase().split("-")[0];
  if (primary === "pt") return "pt-BR";
  if (primary === "en") return "en";
  if (primary === "es") return "es";
  return null;
}

// Best supported language of an Accept-Language header, or pt-BR when none matches.
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const candidates = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((param) => /^\s*q=([\d.]+)\s*$/.exec(param)?.[1]).find(Boolean);
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q), index };
    })
    .filter((candidate) => candidate.tag && candidate.tag !== "*" && candidate.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of candidates) {
    const locale = localeOfTag(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
