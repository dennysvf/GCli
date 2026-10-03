import { describe, expect, it } from "vitest";
import { messageKey, splitMessageKey } from "./message-key";

describe("message keys with parameters", () => {
  it("round-trips a key and its parameters", () => {
    expect(messageKey("validation.documentInvalid", { type: "CPF" })).toBe(
      "validation.documentInvalid?type=CPF",
    );
    expect(splitMessageKey("validation.documentInvalid?type=CPF")).toEqual({
      key: "validation.documentInvalid",
      params: { type: "CPF" },
    });
  });

  it("returns numeric parameters as numbers so they are formatted per locale", () => {
    expect(splitMessageKey("services.validation.priceRange?max=99999.99&currency=EUR").params).toEqual({
      max: 99999.99,
      currency: "EUR",
    });
  });

  it("leaves plain keys and text alone", () => {
    expect(messageKey("validation.required")).toBe("validation.required");
    expect(splitMessageKey("validation.required")).toEqual({ key: "validation.required", params: {} });
  });
});
