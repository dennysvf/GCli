import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Management dashboard catalog (ADR-028), registered under the "analytics" namespace by the
// composition root.
export const analyticsCatalog: Catalog = { "pt-BR": ptBR, en, es };
