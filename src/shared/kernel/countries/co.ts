import { DOCUMENT_SPECS } from "../documents";
import { TAX_ID_SPECS } from "../tax-id";
import type { CountryProfile, Region } from "./types";

// ISO 3166-2:CO department codes.
export const COLOMBIA_DEPARTMENTS: readonly Region[] = [
  { code: "AMA", name: "Amazonas" },
  { code: "ANT", name: "Antioquia" },
  { code: "ARA", name: "Arauca" },
  { code: "ATL", name: "Atlántico" },
  { code: "BOL", name: "Bolívar" },
  { code: "BOY", name: "Boyacá" },
  { code: "CAL", name: "Caldas" },
  { code: "CAQ", name: "Caquetá" },
  { code: "CAS", name: "Casanare" },
  { code: "CAU", name: "Cauca" },
  { code: "CES", name: "Cesar" },
  { code: "CHO", name: "Chocó" },
  { code: "COR", name: "Córdoba" },
  { code: "CUN", name: "Cundinamarca" },
  { code: "DC", name: "Bogotá D.C." },
  { code: "GUA", name: "Guainía" },
  { code: "GUV", name: "Guaviare" },
  { code: "HUI", name: "Huila" },
  { code: "LAG", name: "La Guajira" },
  { code: "MAG", name: "Magdalena" },
  { code: "MET", name: "Meta" },
  { code: "NAR", name: "Nariño" },
  { code: "NSA", name: "Norte de Santander" },
  { code: "PUT", name: "Putumayo" },
  { code: "QUI", name: "Quindío" },
  { code: "RIS", name: "Risaralda" },
  { code: "SAP", name: "San Andrés y Providencia" },
  { code: "SAN", name: "Santander" },
  { code: "SUC", name: "Sucre" },
  { code: "TOL", name: "Tolima" },
  { code: "VAC", name: "Valle del Cauca" },
  { code: "VAU", name: "Vaupés" },
  { code: "VID", name: "Vichada" },
];

export const CO: CountryProfile = {
  code: "CO",
  nameKey: "countries.names.CO",
  currency: "COP",
  formattingRegion: "es-CO",
  phoneCode: "57",
  // Mobile numbers start with 3 and have 10 digits.
  mobilePattern: /^3\d{9}$/,
  timeZones: ["America/Bogota"],
  defaultTimeZone: "America/Bogota",
  taxId: TAX_ID_SPECS.NIT,
  identityDocuments: [DOCUMENT_SPECS.CC_CO, DOCUMENT_SPECS.CE_CO],
  address: {
    fields: [
      { name: "street", labelKey: "countries.address.street", required: false },
      { name: "number", labelKey: "countries.address.number", required: false },
      { name: "complement", labelKey: "countries.address.complement", required: false },
      { name: "district", labelKey: "countries.address.district.CO", required: false },
      { name: "city", labelKey: "countries.address.city", required: false },
    ],
    postalCode: {
      labelKey: "countries.address.postalCodeLabel.default",
      // Optional in Colombia; when given it has 6 digits.
      pattern: /^\d{6}$/,
      required: false,
      normalize: (input) => input.replace(/\D/g, "").slice(0, 6),
      format: (value) => value,
    },
    region: {
      labelKey: "countries.address.regionLabel.CO",
      required: false,
      regions: COLOMBIA_DEPARTMENTS,
    },
  },
  councils: [
    { type: "RETHUS", labelKey: "countries.councils.RETHUS", regionRequired: false },
    { type: "OTHER", labelKey: "countries.councils.OTHER", regionRequired: false, needsName: true },
  ],
  paymentMethods: ["CASH", "DEBIT_CARD", "CREDIT_CARD", "TRANSFER", "NEQUI", "PSE", "OTHER"],
  legalRulesValidated: false,
};
