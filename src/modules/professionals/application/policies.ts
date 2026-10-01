import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";

type PolicyContext = Pick<RequestContext, "user" | "linkedProfessionalId">;

// Resource-level rules (architecture 5.2). PRD F01 matrix: Administrator, Manager and Front Desk
// see every professional; a Professional-role user sees only the profile linked to them.
export function canViewProfessional(ctx: PolicyContext, professionalId: string): boolean {
  if (can(ctx, "professional:read-all")) return true;
  return can(ctx, "professional:read") && ctx.linkedProfessionalId === professionalId;
}

// PRD F04: professionals can create and delete their own time-offs; managers manage all.
export function canManageTimeOff(ctx: PolicyContext, professionalId: string): boolean {
  if (can(ctx, "professional:manage")) return true;
  return can(ctx, "professional:manage-own-time-off") && ctx.linkedProfessionalId === professionalId;
}
