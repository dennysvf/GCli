import { getRequestContext } from "@/modules/identity/next";
import { patients } from "@/modules/patients";
import { toActionResult } from "@/shared/kernel/action-result";

// Signed consent term upload (spec F05 section 5, ADR-023): session and patient:manage required;
// the use case checks size and type and stores the file privately.
export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return Response.json({ ok: false, error: { code: "AUTH_UNAUTHENTICATED" } }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    const invalid = { ok: false as const, error: { code: "PATIENTS_INVALID_FILE", httpStatus: 400 } };
    return Response.json(toActionResult(invalid, ctx.locale, "patients"), { status: 400 });
  }
  const result = await patients.storeConsentFile(ctx, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    name: file.name,
  });
  return Response.json(toActionResult(result, ctx.locale, "patients"), {
    status: result.ok ? 200 : result.error.httpStatus,
  });
}
