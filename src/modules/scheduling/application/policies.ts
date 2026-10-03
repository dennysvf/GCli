import { recordDenial } from "@/shared/authz/guard";
import { can } from "@/shared/authz/permissions";
import type { RequestContext } from "@/shared/context/types";
import { CommonErrors } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { Actor } from "../domain/appointment";
import { OWN_STATUS_TRANSITIONS, type Transition } from "../domain/status";

// Who sees and changes which appointments (PRD F01 matrix, spec F06 section 3). Hiding the UI is
// never the protection: every use case calls these checks.

export type AgendaScope = { kind: "all" } | { kind: "own"; professionalId: string } | { kind: "none" };

export function agendaScope(ctx: RequestContext): AgendaScope {
  if (can(ctx, "schedule:read-all")) return { kind: "all" };
  if (can(ctx, "schedule:read-own") && ctx.linkedProfessionalId) {
    return { kind: "own", professionalId: ctx.linkedProfessionalId };
  }
  return { kind: "none" };
}

// Read access to the agenda; the scope then filters what the reader sees.
export async function authorizeRead(ctx: RequestContext): Promise<Result<AgendaScope>> {
  const scope = agendaScope(ctx);
  if (scope.kind !== "none") return ok(scope);
  await recordDenial(ctx, "schedule:read-own");
  return fail(CommonErrors.forbidden());
}

export function canSee(scope: AgendaScope, appointment: { professionalId: string }): boolean {
  return (
    scope.kind === "all" || (scope.kind === "own" && scope.professionalId === appointment.professionalId)
  );
}

export function isOwnAppointment(ctx: RequestContext, appointment: { professionalId: string }): boolean {
  return ctx.linkedProfessionalId !== null && ctx.linkedProfessionalId === appointment.professionalId;
}

export function actorOf(ctx: RequestContext, appointment: { professionalId: string }): Actor {
  return {
    userId: ctx.user.id,
    isOwnProfessional: isOwnAppointment(ctx, appointment),
    canRevertAnyTime: can(ctx, "schedule:revert-completion"),
  };
}

// schedule:manage changes every status except the completion reversal, which belongs to the
// professional (30 minutes) and to Manager/Administrator (schedule:revert-completion).
export async function authorizeTransition(
  ctx: RequestContext,
  transition: Transition,
  appointment: { id: string; professionalId: string },
): Promise<Result<void>> {
  const own = isOwnAppointment(ctx, appointment) && can(ctx, "schedule:update-own-status");
  const allowed =
    transition === "REVERT_COMPLETION"
      ? own || can(ctx, "schedule:revert-completion")
      : can(ctx, "schedule:manage") || (own && OWN_STATUS_TRANSITIONS.includes(transition));
  if (allowed) return ok(undefined);
  await recordDenial(ctx, "schedule:manage", appointment.id);
  return fail(CommonErrors.forbidden());
}
