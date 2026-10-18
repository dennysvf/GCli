import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Patient timeline and LGPD catalog (ADR-028), registered under the "privacy" namespace by the
// composition root. pt-BR is the source; the PRD messages are kept as written.
export const privacyCatalog: Catalog = { "pt-BR": ptBR, en, es };
