import { authorize, recordDenial } from "@/shared/authz/guard";
import { can, type Action } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { DocumentsDeps, PatientForDocument } from "./ports";

// Access rules of patient documents (PRD F08 Capabilities, architecture 5.2): the permission, then
// the visibility of the patient (F05), then, for clinical documents, the F07 records policy. Every
// denial is audited as PERMISSION_DENIED.

export type DocumentAction = Extract<
  Action,
  "document:read" | "document:upload" | "document:generate" | "document:archive"
>;

export type PatientAccess = { patient: PatientForDocument; clinical: boolean };

// The check every patient-scoped use case starts with. `clinical` says whether the user may also
// see clinical documents of this patient.
export async function requirePatientDocuments(
  deps: DocumentsDeps,
  ctx: RequestContext,
  patientId: string,
  action: DocumentAction,
): Promise<Result<PatientAccess>> {
  const allowed = await authorize(ctx, action);
  if (!allowed.ok) return allowed;
  const patient = await deps.directory.patient(ctx, patientId);
  if (!patient.ok) {
    // The patients module already audited a denial; a missing patient is simply not found.
    return fail(
      patient.error.code === "AUTHZ_FORBIDDEN" ? CommonErrors.forbidden() : CommonErrors.notFound(),
    );
  }
  return ok({ patient: patient.value, clinical: await deps.directory.canAccessClinical(ctx, patientId) });
}

// A document that exists: its patient must be visible, and a clinical one needs clinical access.
// A denied clinical read is audited with the document as the target.
export async function requireDocumentAccess(
  deps: DocumentsDeps,
  ctx: RequestContext,
  document: { id: string; patientId: string; isClinical: boolean },
  action: DocumentAction,
): Promise<Result<PatientAccess>> {
  const access = await requirePatientDocuments(deps, ctx, document.patientId, action);
  if (!access.ok) return access;
  if (document.isClinical && !access.value.clinical) {
    await recordDenial(ctx, action, document.id);
    return fail(CommonErrors.forbidden());
  }
  return access;
}

// Managers correct and archive any document; everyone else only corrects what they uploaded.
export function canManageDocuments(ctx: RequestContext): boolean {
  return can(ctx, "document:archive");
}
