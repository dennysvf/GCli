import { DOCUMENT_SPECS } from "../documents";
import { TAX_ID_SPECS } from "../tax-id";
import type { CountryProfile, Region } from "./types";

// ISO 3166-2:CL region codes.
export const CHILE_REGIONS: readonly Region[] = [
  { code: "AP", name: "Arica y Parinacota" },
  { code: "TA", name: "Tarapacá" },
  { code: "AN", name: "Antofagasta" },
  { code: "AT", name: "Atacama" },
  { code: "CO", name: "Coquimbo" },
  { code: "VS", name: "Valparaíso" },
  { code: "RM", name: "Metropolitana de Santiago" },
  { code: "LI", name: "Libertador General Bernardo O'Higgins" },
  { code: "ML", name: "Maule" },
  { code: "NB", name: "Ñuble" },
  { code: "BI", name: "Biobío" },
  { code: "AR", name: "La Araucanía" },
  { code: "LR", name: "Los Ríos" },
  { code: "LL", name: "Los Lagos" },
  { code: "AI", name: "Aysén" },
  { code: "MA", name: "Magallanes y de la Antártica Chilena" },
];

export const CL: CountryProfile = {
  code: "CL",
  nameKey: "countries.names.CL",
  currency: "CLP",
  formattingRegion: "es-CL",
  phoneCode: "56",
  // Mobile numbers start with 9.
  mobilePattern: /^9\d{8}$/,
  timeZones: ["America/Santiago", "America/Punta_Arenas", "Pacific/Easter"],
  defaultTimeZone: "America/Santiago",
  taxId: TAX_ID_SPECS.RUT,
  identityDocuments: [DOCUMENT_SPECS.RUT_CL],
  address: {
    fields: [
      { name: "street", labelKey: "countries.address.street", required: false },
      { name: "number", labelKey: "countries.address.number", required: false },
      { name: "complement", labelKey: "countries.address.complement", required: false },
      { name: "city", labelKey: "countries.address.cityLabel.CL", required: false },
    ],
    postalCode: {
      labelKey: "countries.address.postalCodeLabel.default",
      // Optional in Chile; when given it has 7 digits.
      pattern: /^\d{7}$/,
      required: false,
      normalize: (input) => input.replace(/\D/g, "").slice(0, 7),
      format: (value) => value,
    },
    region: { labelKey: "countries.address.regionLabel.CL", required: false, regions: CHILE_REGIONS },
  },
  councils: [
    { type: "SIS", labelKey: "countries.councils.SIS", regionRequired: false },
    { type: "OTHER", labelKey: "countries.councils.OTHER", regionRequired: false, needsName: true },
  ],
  paymentMethods: ["CASH", "DEBIT_CARD", "CREDIT_CARD", "TRANSFER", "OTHER"],
  legalRulesValidated: false,
};
