import { describe, expect, it } from "vitest";
import { countryAddressSchema, formatCountryAddress, isEmptyAddress } from "./address";

function parse(input: unknown) {
  const result = countryAddressSchema.safeParse(input);
  return result.success
    ? result.data
    : result.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`);
}

describe("country address schema", () => {
  it("F16: the patient address schema follows the country", () => {
    expect(
      parse({ country: "BR", postalCode: "01310-100", street: "Avenida Paulista", region: "sp" }),
    ).toMatchObject({
      country: "BR",
      postalCode: "01310100",
      region: "SP",
    });
    expect(
      parse({
        country: "ES",
        postalCode: "28013",
        street: " Calle Mayor ",
        number: "10",
        city: "Madrid",
        region: "m",
      }),
    ).toMatchObject({
      postalCode: "28013",
      street: "Calle Mayor",
      region: "M",
    });
    expect(parse({ country: "US", postalCode: "100011234", region: "NY" })).toMatchObject({
      postalCode: "10001-1234",
      region: "NY",
    });
    expect(parse({ country: "PT", postalCode: "1000001", region: "Lisboa" })).toMatchObject({
      postalCode: "1000-001",
      region: "Lisboa",
    });
  });

  it("rejects wrong postal codes, regions and countries with message keys", () => {
    expect(parse({ country: "BR", postalCode: "123" })).toEqual(["postalCode:validation.postalCodeInvalid"]);
    expect(parse({ country: "ES", postalCode: "2801" })).toEqual(["postalCode:validation.postalCodeInvalid"]);
    expect(parse({ country: "MX", region: "XX" })).toEqual(["region:validation.address.regionInvalid"]);
    expect(parse({ country: "FR" })).toEqual(["country:validation.countryInvalid"]);
    expect(parse({ country: "BR", street: "x".repeat(151) })).toEqual([
      "street:validation.address.streetTooLong",
    ]);
  });

  it("treats empty strings as missing", () => {
    expect(parse({ country: "CL", postalCode: "", street: "", city: "" })).toEqual({
      country: "CL",
      postalCode: null,
      street: null,
      number: null,
      complement: null,
      district: null,
      city: null,
      region: null,
    });
  });

  it("detects an address with nothing but the country", () => {
    expect(isEmptyAddress({ country: "BR" })).toBe(true);
    expect(isEmptyAddress({ country: "BR", city: "Recife" })).toBe(false);
  });
});

describe("country address formatting", () => {
  const base = {
    postalCode: null,
    street: null,
    number: null,
    complement: null,
    district: null,
    city: null,
    region: null,
  };

  it("keeps the Brazilian order", () => {
    expect(
      formatCountryAddress({
        ...base,
        country: "BR",
        street: "Avenida Paulista",
        number: "1000",
        complement: "Sala 12",
        district: "Bela Vista",
        city: "São Paulo",
        region: "SP",
        postalCode: "01310100",
      }),
    ).toBe("Avenida Paulista, 1000 - Sala 12 - Bela Vista, São Paulo/SP - CEP 01310-100");
  });

  it("writes Spanish, Portuguese and American addresses in their own order", () => {
    expect(
      formatCountryAddress({
        ...base,
        country: "ES",
        street: "Calle Mayor",
        number: "10",
        city: "Madrid",
        region: "M",
        postalCode: "28013",
      }),
    ).toBe("Calle Mayor, 10 - 28013 Madrid (Madrid)");
    expect(
      formatCountryAddress({
        ...base,
        country: "PT",
        street: "Rua Augusta",
        number: "5",
        city: "Lisboa",
        postalCode: "1100-053",
      }),
    ).toBe("Rua Augusta, 5 - 1100-053 Lisboa");
    expect(
      formatCountryAddress({
        ...base,
        country: "US",
        street: "123 Main St",
        complement: "Apt 4",
        city: "New York",
        region: "NY",
        postalCode: "10001",
      }),
    ).toBe("123 Main St, Apt 4 - New York, NY 10001");
  });

  it("returns an empty string for an empty address", () => {
    expect(formatCountryAddress({ ...base, country: "MX" })).toBe("");
  });
});
