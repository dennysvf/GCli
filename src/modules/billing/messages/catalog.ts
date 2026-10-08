import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Billing catalog (ADR-028), registered under the "billing" namespace by the composition root.
export const billingCatalog: Catalog = { "pt-BR": ptBR, en, es };
