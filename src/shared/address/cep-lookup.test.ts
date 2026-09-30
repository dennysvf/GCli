import { describe, expect, it } from "vitest";
import { lookupCep, normalizeCep } from "./cep-lookup";

type Route = (url: string) => Response | Promise<Response>;

function fakeFetch(route: Route): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const response = await route(url);
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return response;
  }) as typeof fetch;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const BRASILAPI = {
  cep: "01310100",
  state: "SP",
  city: "São Paulo",
  neighborhood: "Bela Vista",
  street: "Avenida Paulista",
};
const VIACEP = {
  cep: "01310-100",
  logradouro: "Avenida Paulista",
  bairro: "Bela Vista",
  localidade: "São Paulo",
  uf: "SP",
};
const EXPECTED = {
  cep: "01310100",
  street: "Avenida Paulista",
  district: "Bela Vista",
  city: "São Paulo",
  state: "SP",
};

describe("CEP lookup", () => {
  it("normalizes masked CEPs and rejects invalid ones", () => {
    expect(normalizeCep("01310-100")).toBe("01310100");
    expect(normalizeCep("1234")).toBeNull();
  });

  it("F02: CEP lookup uses BrasilAPI when it answers", async () => {
    const result = await lookupCep("01310-100", {
      fetch: fakeFetch((url) => (url.includes("brasilapi") ? json(200, BRASILAPI) : json(500, {}))),
    });
    expect(result).toEqual({ status: "found", address: EXPECTED });
  });

  it("F02: CEP lookup falls back to ViaCEP when BrasilAPI fails", async () => {
    const result = await lookupCep("01310100", {
      fetch: fakeFetch((url) => (url.includes("brasilapi") ? json(503, {}) : json(200, VIACEP))),
    });
    expect(result).toEqual({ status: "found", address: EXPECTED });
  });

  it("reports not found only when no provider has the CEP", async () => {
    const result = await lookupCep("99999999", {
      fetch: fakeFetch((url) => (url.includes("brasilapi") ? json(404, {}) : json(200, { erro: "true" }))),
    });
    expect(result).toEqual({ status: "not_found" });
  });

  it("F02: CEP lookup times out after the budget and reports unavailable", async () => {
    const slow = fakeFetch(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(json(200, BRASILAPI)), 200)),
    );
    const result = await lookupCep("01310100", { fetch: slow, timeoutMs: 50 });
    expect(result).toEqual({ status: "unavailable" });
  });
});
