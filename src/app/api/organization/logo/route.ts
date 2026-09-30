import { identity } from "@/modules/identity";
import { getRequestContext } from "@/modules/identity/next";

// Organization logo (spec F01 section 5): session required, PNG with ETag, private cache.
export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return new Response(null, { status: 401 });
  const result = await identity.getOrganizationLogo(ctx);
  if (!result.ok) return new Response(null, { status: result.error.httpStatus });
  if (!result.value) return new Response(null, { status: 404 });

  const { body, etag } = result.value;
  const headers = { ETag: etag, "Cache-Control": "private, max-age=300" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(Buffer.from(body), {
    status: 200,
    headers: { ...headers, "Content-Type": "image/png" },
  });
}
