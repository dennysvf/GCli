import type { Prisma } from "@/generated/prisma/client";
import type { AnyContext } from "@/shared/context/types";
import { newId } from "@/shared/kernel/ids";
import type { Changes } from "./diff";

// Actions recorded in audit_event (spec F01 section 6).
export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "READ_SENSITIVE"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET"
  | "PERMISSION_DENIED"
  | "EXPORT";

export type AuditEntry = {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  summary?: string;
  changes?: Changes;
  metadata?: Record<string, unknown>;
  // Overrides for anonymous flows where the actor or organization is resolved later (sign-in).
  actorUserId?: string | null;
  organizationId?: string | null;
};

type AuditClient = { auditEvent: { create(args: { data: Prisma.AuditEventUncheckedCreateInput }): unknown } };

export type AuditWriter = { record(entry: AuditEntry): Promise<void> };

function actorOf(ctx: AnyContext): {
  actorType: "USER" | "SYSTEM" | "ANONYMOUS";
  actorUserId: string | null;
} {
  if (ctx.kind === "user") return { actorType: "USER", actorUserId: ctx.user.id };
  return { actorType: ctx.kind === "system" ? "SYSTEM" : "ANONYMOUS", actorUserId: null };
}

// Always called with the transaction client of the change it records, so a change and its
// audit entry commit or roll back together.
export function createAuditWriter(client: AuditClient, ctx: AnyContext): AuditWriter {
  return {
    async record(entry) {
      const actor = actorOf(ctx);
      const actorUserId = entry.actorUserId !== undefined ? entry.actorUserId : actor.actorUserId;
      const actorType = actor.actorType === "ANONYMOUS" && actorUserId ? "USER" : actor.actorType;
      await client.auditEvent.create({
        data: {
          id: newId(),
          organizationId: entry.organizationId !== undefined ? entry.organizationId : ctx.organizationId,
          actorType,
          actorUserId,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          summary: entry.summary ?? null,
          changes: (entry.changes as Prisma.InputJsonValue | undefined) ?? undefined,
          metadata: (entry.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
          ipAddress: ctx.ipAddress,
          requestId: ctx.requestId,
        },
      });
    },
  };
}
