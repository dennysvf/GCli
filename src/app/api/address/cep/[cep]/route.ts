import { getRequestContext } from "@/modules/identity/next";
import { lookupCep, normalizeCep } from "@/shared/address/cep-lookup";
import { consume } from "@/shared/security/rate-limiter";

// CEP lookup for address forms (spec F02 section 5). Session required so the route cannot be
// used as an open proxy; 30 lookups per minute per user.
const PER_USER = { limit: 30, windowSeconds: 60 };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/address/cep/[cep]">) {
  const ctx = await getRequestContext();
  if (!ctx) return new Response(null, { status: 401 });
  if (!(await consume(`cep:user:${ctx.user.id}`, PER_USER, new Date()))) {
    return new Response(null, { status: 429 });
  }

  const cep = normalizeCep((await context.params).cep);
  if (!cep) return Response.json({ error: "invalid_cep" }, { status: 400 });

  const result = await lookupCep(cep);
  const headers = { "Cache-Control": "private, max-age=86400" };
  if (result.status === "found") return Response.json(result.address, { headers });
  if (result.status === "not_found") return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ error: "unavailable" }, { status: 503 });
}
