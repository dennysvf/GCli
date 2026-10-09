import { billing } from "@/modules/billing";
import { getRequestContext } from "@/modules/identity/next";

// The receipt PDF of a charge (spec F09 section 5): authorized by the use case, shown inline.
export async function GET(_request: Request, context: { params: Promise<{ chargeId: string }> }) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ code: "AUTH_UNAUTHENTICATED" }, { status: 401 });
  const { chargeId } = await context.params;
  const receipt = await billing.renderReceipt(ctx, { chargeId });
  if (!receipt.ok) return Response.json({ code: receipt.error.code }, { status: receipt.error.httpStatus });
  return new Response(new Uint8Array(receipt.value.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receipt.value.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
