import { formatLongDate } from "@/shared/i18n/calendar-names";
import { formatDate, formatLocale } from "@/shared/i18n/format";
import type { Locale } from "@/shared/i18n/locales";
import { formatDocument, type DocumentType } from "@/shared/kernel/documents";
import { formatTaxId } from "@/shared/kernel/tax-id";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import type { VariableName } from "../domain/template-variables";
import type {
  OrganizationForDocument,
  PatientForDocument,
  ProfessionalForDocument,
  UnitForDocument,
} from "./ports";

// The variables of a template (PRD F08 Capabilities) as a registry of resolvers (architecture 11.1,
// Open/Closed): a new variable is one entry here and one in the domain list. A resolver returns the
// text to print, or null when the data is not registered, which the generation reports as missing.

export type VariableContext = {
  patient: PatientForDocument;
  professional: ProfessionalForDocument;
  unit: UnitForDocument;
  organization: OrganizationForDocument;
  now: Date;
  // The language of the user who issues the document (PRD F16).
  locale: Locale;
};

const blank = (value: string | null | undefined): string | null => (value && value.trim() ? value : null);

const RESOLVERS: Record<VariableName, (context: VariableContext) => string | null> = {
  "paciente.nome": ({ patient }) => blank(patient.displayName),
  // The patient's identity document of any type, formatted by its profile (CPF in Brazil).
  "paciente.cpf": ({ patient }) =>
    patient.document
      ? blank(formatDocument(patient.document.type as DocumentType, patient.document.number))
      : null,
  "paciente.data_nascimento": ({ patient, locale, unit }) =>
    blank(patient.birthDate) ? formatDate(patient.birthDate, formatLocale(locale, unit.country)) : null,
  "profissional.nome": ({ professional }) => blank(professional.displayName),
  "profissional.registro": ({ professional }) => blank(professional.registration),
  "profissional.especialidade": ({ professional }) => blank(professional.specialty),
  "unidade.nome": ({ unit }) => blank(unit.name),
  "unidade.endereco": ({ unit }) => blank(unit.formattedAddress),
  "clinica.nome": ({ organization }) => blank(organization.name),
  "clinica.cnpj": ({ organization }) =>
    organization.taxId ? blank(formatTaxId(organization.country, organization.taxId)) : null,
  data_hoje: ({ now, unit, locale }) => formatDate(now, formatLocale(locale, unit.country), unit.timeZone),
  data_extenso: ({ now, unit, locale }) => formatLongDate(dateInTimeZone(now, unit.timeZone), locale),
};

export function resolveVariables(context: VariableContext): Record<string, string | null> {
  return Object.fromEntries(
    (Object.entries(RESOLVERS) as [VariableName, (context: VariableContext) => string | null][]).map(
      ([name, resolve]) => [name, resolve(context)],
    ),
  );
}
