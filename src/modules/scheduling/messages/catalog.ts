import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Scheduling catalog (ADR-028), registered under the "scheduling" namespace by the composition root.
export const schedulingCatalog: Catalog = { "pt-BR": ptBR, en, es };
