import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Clinical-records catalog (ADR-028), registered under the "clinicalRecords" namespace by the
// composition root.
export const clinicalRecordsCatalog: Catalog = { "pt-BR": ptBR, en, es };
