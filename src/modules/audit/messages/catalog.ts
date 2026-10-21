import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Audit log viewer catalog (ADR-028), registered under the "audit" namespace by the composition root.
export const auditCatalog: Catalog = { "pt-BR": ptBR, en, es };
