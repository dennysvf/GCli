import { z } from "zod";
import { COUNTRY_CODES, type CountryCode } from "./countries/codes";
import { BRAZIL_REGIONS } from "./countries/br";
import { countryProfile } from "./countries";

// Brazilian address shared by units (F02) and patients (F05). CEP is stored with 8 digits and the
// state as a UF; empty form strings become null. The generic, country-driven address of PRD F16 is
// at the end of this file; the Brazilian one goes away when units and patients move to it.
export const BRAZIL_STATES: readonly string[] = BRAZIL_REGIONS.map((region) => region.code);

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);

const digitsOnly = (value: string | null | undefined) => (value ? value.replace(/\D/g, "") : null);

export const addressSchema = z.object({
  cep: z
    .string()
    .nullish()
    .transform(digitsOnly)
    .refine((value) => value === null || /^\d{8}$/.test(value), "CEP inválido."),
  street: optionalText(150, "Logradouro muito longo."),
  number: optionalText(20, "Número muito longo."),
  complement: optionalText(80, "Complemento muito longo."),
  district: optionalText(80, "Bairro muito longo."),
  city: optionalText(80, "Cidade muito longa."),
  state: z
    .string()
    .nullish()
    .transform((value) => (value ? value.toUpperCase() : null))
    .refine(
      (value) => value === null || (BRAZIL_STATES as readonly string[]).includes(value),
      "UF inválida.",
    ),
});

export type AddressInput = z.input<typeof addressSchema>;
export type Address = z.output<typeof addressSchema>;

export function maskCep(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : (value ?? "");
}

// "Avenida Paulista, 1000 - Sala 12 - Bela Vista, São Paulo/SP - CEP 01310-100"
export function formatAddress(address: {
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
}): string {
  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  const cityLine = [address.city, address.state].filter(Boolean).join("/");
  const districtCity = [address.district, cityLine].filter(Boolean).join(", ");
  const cep = address.cep ? `CEP ${address.cep.slice(0, 5)}-${address.cep.slice(5)}` : "";
  return [streetLine, address.complement, districtCity, cep].filter(Boolean).join(" - ");
}

// ---- Generic address (PRD F16, ADR-029) ----

export type CountryAddress = {
  country: CountryCode;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
};

const MAX_LENGTHS = { street: 150, number: 20, complement: 80, district: 80, city: 80, region: 64 } as const;

const text = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);

const addressFields = {
  postalCode: z.string().nullish(),
  street: text(MAX_LENGTHS.street, "validation.address.streetTooLong"),
  number: text(MAX_LENGTHS.number, "validation.address.numberTooLong"),
  complement: text(MAX_LENGTHS.complement, "validation.address.complementTooLong"),
  district: text(MAX_LENGTHS.district, "validation.address.districtTooLong"),
  city: text(MAX_LENGTHS.city, "validation.address.cityTooLong"),
  region: text(MAX_LENGTHS.region, "validation.address.regionTooLong"),
};

// The fields of an address whose country comes from elsewhere (a unit's address has the unit's).
export const addressFieldsSchema = z.object(addressFields);
export type AddressFieldsInput = z.input<typeof addressFieldsSchema>;

type AddIssue = (path: string, message: string) => void;

// Applies the country's rules: postal code pattern and, when the profile lists them, the region.
export function normalizeAddress(
  country: CountryCode,
  value: z.output<typeof addressFieldsSchema>,
  addIssue: AddIssue,
): CountryAddress {
  const { address } = countryProfile(country);
  const postalCode = value.postalCode ? address.postalCode.normalize(value.postalCode) : "";
  if (postalCode && !address.postalCode.pattern.test(postalCode)) {
    addIssue("postalCode", "validation.postalCodeInvalid");
  }
  let region = value.region;
  if (region && address.region.regions) {
    const code = region.toUpperCase();
    if (address.region.regions.some((item) => item.code === code)) region = code;
    else addIssue("region", "validation.address.regionInvalid");
  }
  return { ...value, country, postalCode: postalCode || null, region };
}

// Messages are catalog keys (ADR-028). The country decides the postal code pattern and whether
// the region comes from a closed list.
export const countryAddressSchema = z
  .object({ country: z.enum(COUNTRY_CODES, { error: "validation.countryInvalid" }), ...addressFields })
  .transform((value, ctx): CountryAddress =>
    normalizeAddress(value.country, value, (path, message) =>
      ctx.addIssue({ code: "custom", path: [path], message }),
    ),
  );

export type CountryAddressInput = z.input<typeof countryAddressSchema>;

// An address with no field filled in besides the country counts as empty.
export function isEmptyAddress(address: Partial<CountryAddress>): boolean {
  return (["postalCode", "street", "number", "complement", "district", "city", "region"] as const).every(
    (field) => !address[field],
  );
}

// Written in the order each country uses; the region shows its name when the profile lists it.
export function formatCountryAddress(address: CountryAddress): string {
  const profile = countryProfile(address.country);
  const postalCode = address.postalCode ? profile.address.postalCode.format(address.postalCode) : null;
  const regionName =
    profile.address.region.regions?.find((item) => item.code === address.region)?.name ?? address.region;
  if (address.country === "BR") {
    const streetLine = [address.street, address.number].filter(Boolean).join(", ");
    const cityLine = [address.city, address.region].filter(Boolean).join("/");
    const districtCity = [address.district, cityLine].filter(Boolean).join(", ");
    return [streetLine, address.complement, districtCity, postalCode ? `CEP ${postalCode}` : ""]
      .filter(Boolean)
      .join(" - ");
  }
  if (address.country === "US") {
    // "123 Main St, Apt 4 - New York, NY 10001": the street carries the number.
    const cityLine = [address.city, [address.region, postalCode].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    return [[address.street, address.complement].filter(Boolean).join(", "), cityLine]
      .filter(Boolean)
      .join(" - ");
  }
  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  const locality = [[postalCode, address.city].filter(Boolean).join(" "), regionName ? `(${regionName})` : ""]
    .filter(Boolean)
    .join(" ");
  return [streetLine, address.complement, address.district, locality].filter(Boolean).join(" - ");
}
