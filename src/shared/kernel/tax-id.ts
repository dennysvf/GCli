// Tax IDs of organizations and units by country (PRD F16, ADR-029): CNPJ, NIF/NIPC, NIF/CIF, RFC,
// CUIT, RUT, NIT and EIN. Values are stored normalized (upper case, no punctuation).
import { formatCnpj, isValidCnpj, normalizeCnpj } from "./cnpj";
import type { CountryCode } from "./countries/codes";
import {
  isValidCifEs,
  isValidCuit,
  isValidDniEs,
  isValidNieEs,
  isValidNifPt,
  isValidNit,
  isValidRfc,
  isValidRut,
} from "./id-checks";

export const TAX_ID_TYPES = ["CNPJ", "NIF_PT", "NIF_ES", "RFC", "CUIT", "RUT", "NIT", "EIN"] as const;
export type TaxIdType = (typeof TAX_ID_TYPES)[number];

export type TaxIdSpec = {
  type: TaxIdType;
  country: CountryCode;
  // Catalog key of the full name, and the abbreviation used inside messages.
  labelKey: string;
  shortLabel: string;
  maxLength: number;
  normalize(input: string): string;
  validate(normalized: string): boolean;
  format(normalized: string): string;
};

const stripped = (input: string) => input.toUpperCase().replace(/[^0-9A-ZÑ&]/g, "");

function dotted(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export const TAX_ID_SPECS: Record<TaxIdType, TaxIdSpec> = {
  CNPJ: {
    type: "CNPJ",
    country: "BR",
    labelKey: "countries.taxIds.CNPJ",
    shortLabel: "CNPJ",
    maxLength: 14,
    normalize: normalizeCnpj,
    validate: isValidCnpj,
    format: (value) => (value.length === 14 ? formatCnpj(value) : value),
  },
  NIF_PT: {
    type: "NIF_PT",
    country: "PT",
    labelKey: "countries.taxIds.NIF_PT",
    shortLabel: "NIF",
    maxLength: 9,
    normalize: stripped,
    validate: isValidNifPt,
    format: (value) => value,
  },
  NIF_ES: {
    type: "NIF_ES",
    country: "ES",
    labelKey: "countries.taxIds.NIF_ES",
    shortLabel: "NIF",
    maxLength: 9,
    normalize: stripped,
    validate: (value) => isValidDniEs(value) || isValidNieEs(value) || isValidCifEs(value),
    format: (value) => value,
  },
  RFC: {
    type: "RFC",
    country: "MX",
    labelKey: "countries.taxIds.RFC",
    shortLabel: "RFC",
    maxLength: 13,
    normalize: stripped,
    validate: isValidRfc,
    format: (value) => value,
  },
  CUIT: {
    type: "CUIT",
    country: "AR",
    labelKey: "countries.taxIds.CUIT",
    shortLabel: "CUIT",
    maxLength: 11,
    normalize: stripped,
    validate: isValidCuit,
    format: (value) =>
      value.length === 11 ? `${value.slice(0, 2)}-${value.slice(2, 10)}-${value.slice(10)}` : value,
  },
  RUT: {
    type: "RUT",
    country: "CL",
    labelKey: "countries.taxIds.RUT",
    shortLabel: "RUT",
    maxLength: 9,
    normalize: stripped,
    validate: isValidRut,
    format: (value) => (value.length > 1 ? `${dotted(value.slice(0, -1))}-${value.slice(-1)}` : value),
  },
  NIT: {
    type: "NIT",
    country: "CO",
    labelKey: "countries.taxIds.NIT",
    shortLabel: "NIT",
    maxLength: 11,
    normalize: stripped,
    validate: isValidNit,
    format: (value) => (value.length > 1 ? `${dotted(value.slice(0, -1))}-${value.slice(-1)}` : value),
  },
  EIN: {
    type: "EIN",
    country: "US",
    labelKey: "countries.taxIds.EIN",
    shortLabel: "EIN",
    maxLength: 9,
    normalize: stripped,
    validate: (value) => /^\d{9}$/.test(value),
    format: (value) => (value.length > 2 ? `${value.slice(0, 2)}-${value.slice(2)}` : value),
  },
};

export const TAX_ID_OF_COUNTRY: Record<CountryCode, TaxIdType> = {
  BR: "CNPJ",
  PT: "NIF_PT",
  ES: "NIF_ES",
  MX: "RFC",
  AR: "CUIT",
  CL: "RUT",
  CO: "NIT",
  US: "EIN",
};

export function taxIdSpec(country: CountryCode): TaxIdSpec {
  return TAX_ID_SPECS[TAX_ID_OF_COUNTRY[country]];
}

export function normalizeTaxId(country: CountryCode, input: string): string {
  return taxIdSpec(country).normalize(input);
}

export function validateTaxId(country: CountryCode, input: string): boolean {
  const spec = taxIdSpec(country);
  return spec.validate(spec.normalize(input));
}

// Partial input is formatted as far as it goes.
export function formatTaxId(country: CountryCode, input: string): string {
  const spec = taxIdSpec(country);
  return spec.format(spec.normalize(input).slice(0, spec.maxLength));
}
