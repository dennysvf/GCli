import type { Catalog } from "@/shared/i18n/catalogs";
import en from "./en.json";
import es from "./es.json";
import ptBR from "./pt-BR.json";

// Patients catalog (ADR-028), registered under the "patients" namespace by the composition root.
export const patientsCatalog: Catalog = { "pt-BR": ptBR, en, es };
