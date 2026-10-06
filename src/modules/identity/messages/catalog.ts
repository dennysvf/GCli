import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Identity catalog (ADR-028), registered under the "identity" namespace by the composition root.
export const identityCatalog: Catalog = { "pt-BR": ptBR, en, es };
