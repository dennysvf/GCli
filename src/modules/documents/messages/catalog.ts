import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Documents catalog (ADR-028), registered under the "documents" namespace by the composition root.
export const documentsCatalog: Catalog = { "pt-BR": ptBR, en, es };
