import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Cash register and finance catalog (ADR-028), registered under the "cash" namespace by the
// composition root.
export const cashCatalog: Catalog = { "pt-BR": ptBR, en, es };
