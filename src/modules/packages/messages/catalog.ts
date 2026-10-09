import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Packages catalog (ADR-028), registered under the "packages" namespace by the composition root.
export const packagesCatalog: Catalog = { "pt-BR": ptBR, en, es };
