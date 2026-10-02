import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import type { PatientsDeps } from "./ports";

// PRD F01 matrix: Administrator, Manager and Front Desk see every patient; a Professional sees
// only patients with an appointment with them (resource policy, architecture 5.2).
export async function canViewPatient(
  deps: PatientsDeps,
  ctx: RequestContext,
  patientId: string,
): Promise<boolean> {
  if (can(ctx, "patient:manage")) return true;
  if (!can(ctx, "patient:read") || !ctx.linkedProfessionalId) return false;
  return deps.appointments().hasAppointmentWith(ctx.organizationId, ctx.linkedProfessionalId, patientId);
}

// Patients a restricted reader may see, or null when the reader sees everyone.
export async function visiblePatientIds(deps: PatientsDeps, ctx: RequestContext): Promise<string[] | null> {
  if (can(ctx, "patient:manage")) return null;
  if (!can(ctx, "patient:read") || !ctx.linkedProfessionalId) return [];
  return deps.appointments().patientIdsFor(ctx.organizationId, ctx.linkedProfessionalId);
}
