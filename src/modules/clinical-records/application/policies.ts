import { recordDenial } from "@/shared/authz/guard";
import { can, type Action } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { ClinicalRecordsDeps } from "./ports";

// PRD F07 access: only Professionals with at least one appointment with the patient, and
// Administrator or Manager users linked to such a professional (architecture 5.2 resource policy).
// Front Desk users, and professionals without an appointment, are denied and the denial is audited.

export async function canAccessPatientRecords(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  patientId: string,
): Promise<boolean> {
  if (!can(ctx, "clinical:read") || !ctx.linkedProfessionalId) return false;
  const relation = await deps.directory.relation(
    ctx.organizationId,
    ctx.linkedProfessionalId,
    patientId,
    deps.clock(),
  );
  return relation.hasAnyAppointment;
}

// The check every clinical use case starts with: the permission, then the resource rule. Either
// failure records PERMISSION_DENIED (PRD F07: "a permission-denied audit event is recorded").
export async function requirePatientAccess(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  patientId: string,
  action: Extract<Action, "clinical:read" | "clinical:write"> = "clinical:read",
): Promise<Result<{ professionalId: string }>> {
  if (
    !can(ctx, action) ||
    !ctx.linkedProfessionalId ||
    !(await canAccessPatientRecords(deps, ctx, patientId))
  ) {
    await recordDenial(ctx, action, patientId);
    return fail(CommonErrors.forbidden());
  }
  return ok({ professionalId: ctx.linkedProfessionalId });
}

// Writing needs the write permission and a professional profile; the per-action rules (author,
// appointment professional) are checked by the use case and the domain.
export async function requireWriter(ctx: RequestContext): Promise<Result<{ professionalId: string }>> {
  if (!can(ctx, "clinical:write") || !ctx.linkedProfessionalId) {
    await recordDenial(ctx, "clinical:write");
    return fail(CommonErrors.forbidden());
  }
  return ok({ professionalId: ctx.linkedProfessionalId });
}
