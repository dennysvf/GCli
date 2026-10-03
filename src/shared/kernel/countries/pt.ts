import { DOCUMENT_SPECS } from "../documents";
import { TAX_ID_SPECS } from "../tax-id";
import type { CountryProfile } from "./types";

export const PT: CountryProfile = {
  code: "PT",
  nameKey: "countries.names.PT",
  currency: "EUR",
  formattingRegion: "pt-PT",
  phoneCode: "351",
  // Mobile numbers start with 9 (91, 92, 93 and 96).
  mobilePattern: /^9[1236]\d{7}$/,
  timeZones: ["Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira"],
  defaultTimeZone: "Europe/Lisbon",
  taxId: TAX_ID_SPECS.NIF_PT,
  identityDocuments: [DOCUMENT_SPECS.NIF_PT],
  address: {
    fields: [
      { name: "street", labelKey: "countries.address.street", required: false },
      { name: "number", labelKey: "countries.address.number", required: false },
      { name: "complement", labelKey: "countries.address.complement", required: false },
      { name: "district", labelKey: "countries.address.district.PT", required: false },
      { name: "city", labelKey: "countries.address.city", required: false },
    ],
    postalCode: {
      labelKey: "countries.address.postalCodeLabel.default",
      pattern: /^\d{4}-\d{3}$/,
      required: false,
      // "1000-001": the hyphen is added when only digits are typed.
      normalize: (input) => {
        const digits = input.replace(/\D/g, "").slice(0, 7);
        return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
      },
      format: (value) => value,
    },
    // The district is free text; there is no closed list in V1.
    region: { labelKey: "countries.address.regionLabel.PT", required: false },
  },
  councils: [
    { type: "ORDEM_MEDICOS", labelKey: "countries.councils.ORDEM_MEDICOS", regionRequired: false },
    { type: "ORDEM_ENFERMEIROS", labelKey: "countries.councils.ORDEM_ENFERMEIROS", regionRequired: false },
    { type: "ORDEM_PSICOLOGOS", labelKey: "countries.councils.ORDEM_PSICOLOGOS", regionRequired: false },
    {
      type: "ORDEM_NUTRICIONISTAS",
      labelKey: "countries.councils.ORDEM_NUTRICIONISTAS",
      regionRequired: false,
    },
    {
      type: "ORDEM_FARMACEUTICOS",
      labelKey: "countries.councils.ORDEM_FARMACEUTICOS",
      regionRequired: false,
    },
    {
      type: "ORDEM_MEDICOS_DENTISTAS",
      labelKey: "countries.councils.ORDEM_MEDICOS_DENTISTAS",
      regionRequired: false,
    },
    { type: "OTHER", labelKey: "countries.councils.OTHER", regionRequired: false, needsName: true },
  ],
  paymentMethods: ["CASH", "MULTIBANCO", "MBWAY", "DEBIT_CARD", "CREDIT_CARD", "TRANSFER", "OTHER"],
  legalRulesValidated: false,
};
