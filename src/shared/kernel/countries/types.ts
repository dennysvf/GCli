import type { DocumentSpec } from "../documents";
import type { TaxIdSpec } from "../tax-id";
import type { CountryCode, Currency } from "./codes";

export type AddressFieldName = "street" | "number" | "complement" | "district" | "city" | "region";

export type Region = { code: string; name: string };

export type AddressSpec = {
  // Fields of the form in display order, without the postal code and the region. Labels are
  // catalog keys; "required" applies when the form asks for a complete address.
  fields: readonly { name: Exclude<AddressFieldName, "region">; labelKey: string; required: boolean }[];
  postalCode: {
    labelKey: string;
    // Applied to the normalized value.
    pattern: RegExp;
    required: boolean;
    // A lookup service exists only for Brazil (ViaCEP).
    lookup?: "viacep";
    normalize(input: string): string;
    format(normalized: string): string;
  };
  region: {
    labelKey: string;
    required: boolean;
    // A closed list (select) or free text when absent.
    regions?: readonly Region[];
  };
};

export type CouncilSpec = {
  type: string;
  labelKey: string;
  // The state, province or college that issued the registration.
  regionRequired: boolean;
  regions?: readonly Region[];
  // Applied to the registration number when present.
  numberPattern?: RegExp;
  // "Outro" needs the council's name.
  needsName?: boolean;
  // The US National Provider Identifier is stored next to the state license.
  hasNpi?: boolean;
};

export type PaymentMethod = string;

export type CountryProfile = {
  code: CountryCode;
  nameKey: string;
  currency: Currency;
  // BCP 47 region used for numbers and dates when the language is spoken there.
  formattingRegion: string;
  // International dialing code without "+".
  phoneCode: string;
  // Extra shape every national significant number must have, on top of libphonenumber's check.
  nationalPattern?: RegExp;
  // National significant numbers that are mobile, for countries where it matters.
  mobilePattern?: RegExp;
  timeZones: readonly string[];
  defaultTimeZone: string;
  taxId: TaxIdSpec;
  identityDocuments: readonly DocumentSpec[];
  address: AddressSpec;
  councils: readonly CouncilSpec[];
  paymentMethods: readonly PaymentMethod[];
  // PRD Section 7: legal rules are only validated for Brazil; other countries apply the
  // Brazilian rules and show a warning.
  legalRulesValidated: boolean;
};
