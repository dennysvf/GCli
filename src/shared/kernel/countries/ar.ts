import { DOCUMENT_SPECS } from "../documents";
import { TAX_ID_SPECS } from "../tax-id";
import type { CountryProfile, Region } from "./types";

// ISO 3166-2:AR province codes.
export const ARGENTINA_PROVINCES: readonly Region[] = [
  { code: "C", name: "Ciudad Autónoma de Buenos Aires" },
  { code: "B", name: "Buenos Aires" },
  { code: "K", name: "Catamarca" },
  { code: "H", name: "Chaco" },
  { code: "U", name: "Chubut" },
  { code: "X", name: "Córdoba" },
  { code: "W", name: "Corrientes" },
  { code: "E", name: "Entre Ríos" },
  { code: "P", name: "Formosa" },
  { code: "Y", name: "Jujuy" },
  { code: "L", name: "La Pampa" },
  { code: "F", name: "La Rioja" },
  { code: "M", name: "Mendoza" },
  { code: "N", name: "Misiones" },
  { code: "Q", name: "Neuquén" },
  { code: "R", name: "Río Negro" },
  { code: "A", name: "Salta" },
  { code: "J", name: "San Juan" },
  { code: "D", name: "San Luis" },
  { code: "Z", name: "Santa Cruz" },
  { code: "S", name: "Santa Fe" },
  { code: "G", name: "Santiago del Estero" },
  { code: "V", name: "Tierra del Fuego" },
  { code: "T", name: "Tucumán" },
];

export const AR: CountryProfile = {
  code: "AR",
  nameKey: "countries.names.AR",
  currency: "ARS",
  formattingRegion: "es-AR",
  phoneCode: "54",
  timeZones: [
    "America/Argentina/Buenos_Aires",
    "America/Argentina/Cordoba",
    "America/Argentina/Salta",
    "America/Argentina/Jujuy",
    "America/Argentina/Tucuman",
    "America/Argentina/Catamarca",
    "America/Argentina/La_Rioja",
    "America/Argentina/San_Juan",
    "America/Argentina/Mendoza",
    "America/Argentina/San_Luis",
    "America/Argentina/Rio_Gallegos",
    "America/Argentina/Ushuaia",
  ],
  defaultTimeZone: "America/Argentina/Buenos_Aires",
  taxId: TAX_ID_SPECS.CUIT,
  identityDocuments: [DOCUMENT_SPECS.DNI_AR, DOCUMENT_SPECS.CUIT_AR],
  address: {
    fields: [
      { name: "street", labelKey: "countries.address.street", required: false },
      { name: "number", labelKey: "countries.address.number", required: false },
      { name: "complement", labelKey: "countries.address.complement", required: false },
      { name: "city", labelKey: "countries.address.city", required: false },
    ],
    postalCode: {
      labelKey: "countries.address.postalCodeLabel.default",
      // Old format (4 digits) or CPA (letter, 4 digits, 3 letters).
      pattern: /^([A-Z]\d{4}[A-Z]{3}|\d{4})$/,
      required: false,
      normalize: (input) =>
        input
          .toUpperCase()
          .replace(/[^0-9A-Z]/g, "")
          .slice(0, 8),
      format: (value) => value,
    },
    region: {
      labelKey: "countries.address.regionLabel.AR",
      required: false,
      regions: ARGENTINA_PROVINCES,
    },
  },
  councils: [
    {
      type: "MATRICULA_NACIONAL",
      labelKey: "countries.councils.MATRICULA_NACIONAL",
      regionRequired: false,
    },
    {
      type: "MATRICULA_PROVINCIAL",
      labelKey: "countries.councils.MATRICULA_PROVINCIAL",
      regionRequired: true,
      regions: ARGENTINA_PROVINCES,
    },
    { type: "OTHER", labelKey: "countries.councils.OTHER", regionRequired: false, needsName: true },
  ],
  paymentMethods: ["CASH", "DEBIT_CARD", "CREDIT_CARD", "TRANSFER", "MERCADO_PAGO", "OTHER"],
  legalRulesValidated: false,
};
