import { db } from "@/shared/db/client";
import { isRole } from "@/shared/kernel/roles";
import type { IdentityDirectory, IdentityUser, InvitationRecord, UserStatus } from "../application/ports";

// Cross-organization lookups for flows that start before the organization is known
// (sign-in, password reset, invitation links). Uses the unscoped client on purpose.
type UserRow = {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lockedUntil: Date | null;
  failedLoginCount: number;
};

function toUser(row: UserRow | null): IdentityUser | null {
  if (!row || !isRole(row.role)) return null;
  return { ...row, role: row.role, status: row.status as UserStatus };
}

const userSelect = {
  id: true,
  organizationId: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lockedUntil: true,
  failedLoginCount: true,
} as const;

export const prismaDirectory: IdentityDirectory = {
  async findUserByEmail(email) {
    return toUser(await db().user.findUnique({ where: { email: email.toLowerCase() }, select: userSelect }));
  },

  async findUserById(id) {
    return toUser(await db().user.findUnique({ where: { id }, select: userSelect }));
  },

  async findResetTokenUserId(token) {
    const verification = await db().verification.findFirst({
      where: { identifier: `reset-password:${token}`, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return verification?.value ?? null;
  },

  async findInvitationByTokenHash(tokenHash): Promise<InvitationRecord | null> {
    const row = await db().invitation.findUnique({ where: { tokenHash } });
    if (!row || !isRole(row.role)) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status as InvitationRecord["status"],
      expiresAt: row.expiresAt,
      acceptedUserId: row.acceptedUserId,
    };
  },

  async findOrganizationName(organizationId) {
    const org = await db().organization.findUnique({
      where: { id: organizationId },
      select: { legalName: true, tradeName: true },
    });
    return org ? (org.tradeName ?? org.legalName) : null;
  },

  async touchSession(sessionId, now) {
    await db().session.updateMany({ where: { id: sessionId }, data: { lastActiveAt: now } });
  },

  async deleteSession(sessionId) {
    await db().session.deleteMany({ where: { id: sessionId } });
  },
};

export async function countOrganizations(): Promise<number> {
  return db().organization.count();
}
