import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Units catalog (ADR-028), registered under the "units" namespace by the composition root.
export const unitsCatalog: Catalog = { "pt-BR": ptBR, en, es };
