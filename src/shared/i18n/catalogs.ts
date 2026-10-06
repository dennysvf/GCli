// Message catalogs (ADR-028). Shared namespaces live in src/shared/i18n/messages; each module owns
// one catalog per language under its own namespace and registers it from the composition root.
// The registry lives on globalThis because Next.js loads a module more than once per process
// (see ports/registry.ts).
import type { Locale } from "./locales";
import { SUPPORTED_LOCALES } from "./locales";
import en from "./messages/en.json";
import es from "./messages/es.json";
import ptBR from "./messages/pt-BR.json";

export type Messages = { [key: string]: string | Messages };
export type Catalog = Record<Locale, Messages>;

export const sharedCatalog: Catalog = { "pt-BR": ptBR, en, es };

type Registry = { catalogs: Map<string, Catalog>; bundles: Map<Locale, Messages> };
const globalForCatalogs = globalThis as unknown as { gcliCatalogs?: Registry };
const registry = (globalForCatalogs.gcliCatalogs ??= { catalogs: new Map(), bundles: new Map() });

// Registers a module catalog under its namespace, e.g. registerCatalog("patients", patientsCatalog).
export function registerCatalog(namespace: string, catalog: Catalog): void {
  registry.catalogs.set(namespace, catalog);
  registry.bundles.clear();
}

// Every message of a language: the shared namespaces plus one namespace per registered module.
export function getMessages(locale: Locale): Messages {
  const cached = registry.bundles.get(locale);
  if (cached) return cached;
  const bundle: Messages = { ...sharedCatalog[locale] };
  for (const [namespace, catalog] of registry.catalogs) bundle[namespace] = catalog[locale];
  registry.bundles.set(locale, bundle);
  return bundle;
}

export { SUPPORTED_LOCALES };
