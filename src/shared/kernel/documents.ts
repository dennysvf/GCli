// Identity documents by type (PRD F16, ADR-029). A document is a type plus a normalized number
// (upper case, no punctuation). Each spec validates, formats and masks one type; the country
// profiles list which types each country offers. The US social security number is never collected.
import type { CountryCode } from "./countries/codes";
import { formatCpf, isValidCpf, normalizeCpf } from "./cpf";
import { isValidCurp, isValidCuit, isValidDniEs, isValidNieEs, isValidNifPt, isValidRut } from "./id-checks";

export const DOCUMENT_TYPES = [
  "CPF",
  "NIF_PT",
  "DNI_ES",
  "NIE_ES",
  "CURP",
  "DNI_AR",
  "CUIT_AR",
  "RUT_CL",
  "CC_CO",
  "CE_CO",
  "US_DL",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type DocumentSpec = {
  type: DocumentType;
  country: CountryCode;
  // Catalog key of the full name ("Cédula de ciudadanía").
  labelKey: string;
  // Abbreviation used inside messages, the same in every language ("DNI").
  shortLabel: string;
  maxLength: number;
  inputMode: "numeric" | "text";
  validate(normalized: string): boolean;
  format(normalized: string): string;
  mask(normalized: string): string;
};

const MASK_BULLETS = "•••";

// Default mask: bullets and the last 4 characters.
const maskLast4 = (value: string) => (value.length > 4 ? `${MASK_BULLETS}${value.slice(-4)}` : value);

function groupDigits(digits: string, sizes: number[], separators: string[]): string {
  const parts: string[] = [];
  let position = 0;
  for (const size of sizes) {
    const part = digits.slice(position, position + size);
    if (!part) break;
    parts.push(part);
    position += size;
  }
  let result = parts[0] ?? "";
  for (let i = 1; i < parts.length; i++) result += `${separators[i - 1] ?? ""}${parts[i]}`;
  return result;
}

// Thousands separated by dots: "12345678" -> "12.345.678".
function dotted(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const upper = (value: string) => value.toUpperCase().replace(/[^0-9A-ZÑ]/g, "");

export const DOCUMENT_SPECS: Record<DocumentType, DocumentSpec> = {
  CPF: {
    type: "CPF",
    country: "BR",
    labelKey: "countries.documents.CPF",
    shortLabel: "CPF",
    maxLength: 11,
    inputMode: "numeric",
    validate: isValidCpf,
    format: formatCpf,
    // PRD F05: the last 5 digits stay visible, "***.***.247-25".
    mask: (value) =>
      value.length === 11 ? `***.***.${value.slice(6, 9)}-${value.slice(9)}` : maskLast4(value),
  },
  NIF_PT: {
    type: "NIF_PT",
    country: "PT",
    labelKey: "countries.documents.NIF_PT",
    shortLabel: "NIF",
    maxLength: 9,
    inputMode: "numeric",
    validate: isValidNifPt,
    format: (value) => groupDigits(value, [3, 3, 3], [" ", " "]),
    mask: maskLast4,
  },
  DNI_ES: {
    type: "DNI_ES",
    country: "ES",
    labelKey: "countries.documents.DNI_ES",
    shortLabel: "DNI",
    maxLength: 9,
    inputMode: "text",
    validate: isValidDniEs,
    format: (value) => value,
    mask: maskLast4,
  },
  NIE_ES: {
    type: "NIE_ES",
    country: "ES",
    labelKey: "countries.documents.NIE_ES",
    shortLabel: "NIE",
    maxLength: 9,
    inputMode: "text",
    validate: isValidNieEs,
    format: (value) => value,
    mask: maskLast4,
  },
  CURP: {
    type: "CURP",
    country: "MX",
    labelKey: "countries.documents.CURP",
    shortLabel: "CURP",
    maxLength: 18,
    inputMode: "text",
    validate: isValidCurp,
    format: (value) => value,
    mask: maskLast4,
  },
  DNI_AR: {
    type: "DNI_AR",
    country: "AR",
    labelKey: "countries.documents.DNI_AR",
    shortLabel: "DNI",
    maxLength: 8,
    inputMode: "numeric",
    validate: (value) => /^\d{7,8}$/.test(value),
    format: dotted,
    mask: maskLast4,
  },
  CUIT_AR: {
    type: "CUIT_AR",
    country: "AR",
    labelKey: "countries.documents.CUIT_AR",
    shortLabel: "CUIT",
    maxLength: 11,
    inputMode: "numeric",
    validate: isValidCuit,
    format: (value) => groupDigits(value, [2, 8, 1], ["-", "-"]),
    mask: maskLast4,
  },
  RUT_CL: {
    type: "RUT_CL",
    country: "CL",
    labelKey: "countries.documents.RUT_CL",
    shortLabel: "RUT",
    maxLength: 9,
    inputMode: "text",
    validate: isValidRut,
    format: (value) => (value.length > 1 ? `${dotted(value.slice(0, -1))}-${value.slice(-1)}` : value),
    mask: maskLast4,
  },
  CC_CO: {
    type: "CC_CO",
    country: "CO",
    labelKey: "countries.documents.CC_CO",
    shortLabel: "CC",
    maxLength: 10,
    inputMode: "numeric",
    validate: (value) => /^\d{6,10}$/.test(value),
    format: dotted,
    mask: maskLast4,
  },
  CE_CO: {
    type: "CE_CO",
    country: "CO",
    labelKey: "countries.documents.CE_CO",
    shortLabel: "CE",
    maxLength: 7,
    inputMode: "numeric",
    validate: (value) => /^\d{6,7}$/.test(value),
    format: (value) => value,
    mask: maskLast4,
  },
  US_DL: {
    type: "US_DL",
    country: "US",
    labelKey: "countries.documents.US_DL",
    shortLabel: "ID",
    maxLength: 20,
    inputMode: "text",
    validate: (value) => /^[0-9A-Z]{4,20}$/.test(value),
    format: (value) => value,
    mask: maskLast4,
  },
};

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function normalizeDocument(type: DocumentType, value: string): string {
  return type === "CPF" ? normalizeCpf(value) : upper(value);
}

export function validateDocument(type: DocumentType, value: string): boolean {
  return DOCUMENT_SPECS[type].validate(normalizeDocument(type, value));
}

// Partial input is formatted as far as it goes, so masked inputs can call it on every keystroke.
export function formatDocument(type: DocumentType, value: string): string {
  const spec = DOCUMENT_SPECS[type];
  return spec.format(normalizeDocument(type, value).slice(0, spec.maxLength));
}

export function maskDocument(type: DocumentType, value: string): string {
  return DOCUMENT_SPECS[type].mask(normalizeDocument(type, value));
}
