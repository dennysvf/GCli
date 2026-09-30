// CEP lookup for address forms (spec F02 section 3): BrasilAPI v2 first, ViaCEP as fallback,
// within a single 3-second budget. When both fail the user types the address manually.
export type CepAddress = { cep: string; street: string; district: string; city: string; state: string };

export type CepLookupResult =
  { status: "found"; address: CepAddress } | { status: "not_found" } | { status: "unavailable" };

type Fetch = typeof fetch;

export const CEP_TIMEOUT_MS = 3_000;

export function normalizeCep(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return /^\d{8}$/.test(digits) ? digits : null;
}

type ProviderResult = CepLookupResult | "error";

async function getJson(
  fetchFn: Fetch,
  url: string,
  signal: AbortSignal,
): Promise<{ status: number; body: unknown }> {
  const response = await fetchFn(url, { signal, headers: { accept: "application/json" } });
  const body: unknown = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
  return { status: response.status, body };
}

async function fromBrasilApi(fetchFn: Fetch, cep: string, signal: AbortSignal): Promise<ProviderResult> {
  const { status, body } = await getJson(fetchFn, `https://brasilapi.com.br/api/cep/v2/${cep}`, signal);
  if (status === 404) return { status: "not_found" };
  if (status !== 200 || !body || typeof body !== "object") return "error";
  const data = body as Record<string, unknown>;
  return {
    status: "found",
    address: {
      cep,
      street: String(data.street ?? ""),
      district: String(data.neighborhood ?? ""),
      city: String(data.city ?? ""),
      state: String(data.state ?? "").toUpperCase(),
    },
  };
}

async function fromViaCep(fetchFn: Fetch, cep: string, signal: AbortSignal): Promise<ProviderResult> {
  const { status, body } = await getJson(fetchFn, `https://viacep.com.br/ws/${cep}/json/`, signal);
  if (status === 400) return { status: "not_found" };
  if (status !== 200 || !body || typeof body !== "object") return "error";
  const data = body as Record<string, unknown>;
  if (data.erro === true || data.erro === "true") return { status: "not_found" };
  return {
    status: "found",
    address: {
      cep,
      street: String(data.logradouro ?? ""),
      district: String(data.bairro ?? ""),
      city: String(data.localidade ?? ""),
      state: String(data.uf ?? "").toUpperCase(),
    },
  };
}

export async function lookupCep(
  input: string,
  options: { fetch?: Fetch; timeoutMs?: number } = {},
): Promise<CepLookupResult> {
  const cep = normalizeCep(input);
  if (!cep) return { status: "not_found" };
  const fetchFn = options.fetch ?? fetch;
  const signal = AbortSignal.timeout(options.timeoutMs ?? CEP_TIMEOUT_MS);

  let notFound = false;
  for (const provider of [fromBrasilApi, fromViaCep]) {
    if (signal.aborted) break;
    try {
      const result = await provider(fetchFn, cep, signal);
      if (result === "error") continue;
      if (result.status === "found") return result;
      // One provider without the CEP is not conclusive; the other may have it.
      notFound = true;
    } catch {
      // Network error or timeout: try the next provider while time remains.
    }
  }
  return notFound ? { status: "not_found" } : { status: "unavailable" };
}
