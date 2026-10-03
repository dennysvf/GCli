import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Services catalog (ADR-028), registered under the "services" namespace by the composition root.
export const servicesCatalog: Catalog = { "pt-BR": ptBR, en, es };
