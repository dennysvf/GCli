import { authorize } from "@/shared/authz/guard";
import type { AnyContext, RequestContext, SystemContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import type { Locale } from "@/shared/i18n/locales";
import { CommonErrors } from "@/shared/kernel/errors";
import { newId } from "@/shared/kernel/ids";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { Role } from "@/shared/kernel/roles";
import { parseInput } from "@/shared/kernel/validation";
import { INVITATION_TTL_HOURS, MAX_USERS } from "../domain/policies";
import { generateToken, hashToken } from "../domain/tokens";
import { IdentityErrors } from "./errors";
import type { IdentityDeps, RequestMeta } from "./ports";
import { homeFor } from "./sign-in";
import { acceptInvitationSchema, invitationIdSchema, inviteUserSchema } from "./schemas";

// Spec section 3: invitation acceptance 20 per 15 minutes per IP.
const ACCEPT_PER_IP = { limit: 20, windowSeconds: 15 * 60 };

function expiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_HOURS * 3_600_000);
}

function invitationUrl(deps: IdentityDeps, token: string): string {
  return `${deps.appUrl}/invite?token=${encodeURIComponent(token)}`;
}

// Active users plus pending invitations count towards the limit (spec assumptions).
async function seatsInUse(uow: UnitOfWork, now: Date): Promise<number> {
  const [users, invitations] = await Promise.all([
    uow.tx.user.count({ where: { status: "ACTIVE" } }),
    uow.tx.invitation.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
  ]);
  return users + invitations;
}

async function queueInvitationEmail(
  deps: IdentityDeps,
  uow: UnitOfWork,
  invitation: { email: string; name: string; organizationId: string; locale: string },
  token: string,
  expiresAt: Date,
) {
  const organizationName = (await deps.directory.findOrganizationName(invitation.organizationId)) ?? "";
  const organization = await uow.tx.organization.findFirst({ select: { timeZone: true } });
  await uow.outbox.add("email.invitation", {
    to: invitation.email,
    name: invitation.name,
    organizationName,
    url: invitationUrl(deps, token),
    expiresAt: expiresAt.toISOString(),
    // The email is written in the language chosen for the invitation (PRD F16).
    locale: invitation.locale,
    timeZone: organization?.timeZone ?? "America/Sao_Paulo",
  });
}

// Shared by InviteUser and the setup:admin command.
export async function createInvitation(
  deps: IdentityDeps,
  ctx: AnyContext,
  input: { name: string; email: string; role: Role; locale?: Locale | undefined },
): Promise<Result<{ invitationId: string; expiresAt: Date; url: string }>> {
  if (await deps.directory.findUserByEmail(input.email)) return fail(IdentityErrors.emailInUse());
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    if (await uow.tx.invitation.findFirst({ where: { email: input.email, status: "PENDING" } })) {
      return fail(IdentityErrors.invitationPending());
    }
    if ((await seatsInUse(uow, now)) >= MAX_USERS) return fail(IdentityErrors.userLimit());

    const token = generateToken();
    const expiresAt = expiry(now);
    const id = newId();
    const organizationId = ctx.organizationId ?? "";
    // Without a choice, the invitation uses the organization default language.
    const locale =
      input.locale ??
      (await uow.tx.organization.findFirst({ select: { defaultLocale: true } }))?.defaultLocale ??
      "pt-BR";
    await uow.tx.invitation.create({
      data: {
        id,
        organizationId,
        email: input.email,
        name: input.name,
        role: input.role,
        locale,
        tokenHash: hashToken(token),
        expiresAt,
        invitedById: ctx.kind === "user" ? ctx.user.id : null,
      },
    });
    await queueInvitationEmail(deps, uow, { ...input, organizationId, locale }, token, expiresAt);
    await uow.audit.record({
      action: "CREATE",
      entityType: "invitation",
      entityId: id,
      summary: `Convite criado (${input.role})`,
      changes: { role: { before: null, after: input.role }, status: { before: null, after: "PENDING" } },
    });
    return ok({ invitationId: id, expiresAt, url: invitationUrl(deps, token) });
  });
}

export async function inviteUser(
  deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ invitationId: string; expiresAt: string }>> {
  const allowed = await authorize(ctx, "user:invite");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(inviteUserSchema, input);
  if (!parsed.ok) return parsed;
  const result = await createInvitation(deps, ctx, parsed.value);
  if (!result.ok) return result;
  return ok({ invitationId: result.value.invitationId, expiresAt: result.value.expiresAt.toISOString() });
}

// PRD F01: resending invalidates the previous link (token hash and expiry are rotated).
export async function resendInvitation(
  deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ expiresAt: string }>> {
  const allowed = await authorize(ctx, "user:invite");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(invitationIdSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();
  return withTransaction(ctx, async (uow) => {
    const invitation = await uow.tx.invitation.findFirst({ where: { id: parsed.value.invitationId } });
    if (!invitation || invitation.status !== "PENDING") return fail(IdentityErrors.invitationNotPending());
    const token = generateToken();
    const expiresAt = expiry(now);
    await uow.tx.invitation.update({
      where: { id: invitation.id },
      data: { tokenHash: hashToken(token), expiresAt, resendCount: { increment: 1 } },
    });
    await queueInvitationEmail(deps, uow, invitation, token, expiresAt);
    await uow.audit.record({
      action: "UPDATE",
      entityType: "invitation",
      entityId: invitation.id,
      summary: "Convite reenviado",
      changes: { expiresAt: { before: invitation.expiresAt.toISOString(), after: expiresAt.toISOString() } },
    });
    return ok({ expiresAt: expiresAt.toISOString() });
  });
}

export async function revokeInvitation(
  deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<Record<string, never>>> {
  const allowed = await authorize(ctx, "user:invite");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(invitationIdSchema, input);
  if (!parsed.ok) return parsed;
  return withTransaction(ctx, async (uow) => {
    const invitation = await uow.tx.invitation.findFirst({ where: { id: parsed.value.invitationId } });
    if (!invitation || invitation.status !== "PENDING") return fail(IdentityErrors.invitationNotPending());
    await uow.tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "REVOKED", revokedAt: deps.clock() },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "invitation",
      entityId: invitation.id,
      summary: "Convite revogado",
      changes: { status: { before: "PENDING", after: "REVOKED" } },
    });
    return ok({});
  });
}

export type InvitationPreview = { name: string; email: string; organizationName: string; role: Role };

export async function getInvitation(deps: IdentityDeps, token: string): Promise<Result<InvitationPreview>> {
  if (!token) return fail(IdentityErrors.linkInvalid());
  const invitation = await deps.directory.findInvitationByTokenHash(hashToken(token));
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= deps.clock()) {
    return fail(IdentityErrors.linkInvalid());
  }
  return ok({
    name: invitation.name,
    email: invitation.email,
    organizationName: (await deps.directory.findOrganizationName(invitation.organizationId)) ?? "",
    role: invitation.role,
  });
}

// Creates the user and its credential in one transaction, then signs in (spec section 3; the
// single-use rule is enforced by a conditional update on the invitation row).
export async function acceptInvitation(
  deps: IdentityDeps,
  input: unknown,
  meta: RequestMeta,
): Promise<Result<{ redirectTo: string; setCookies: string[] }>> {
  const now = deps.clock();
  if (
    meta.ipAddress &&
    !(await deps.rateLimiter.consume(`invite:ip:${meta.ipAddress}`, ACCEPT_PER_IP, now))
  ) {
    return fail(IdentityErrors.rateLimited());
  }
  const parsed = parseInput(acceptInvitationSchema, input);
  if (!parsed.ok) return parsed;
  const { token, password } = parsed.value;

  const invitation = await deps.directory.findInvitationByTokenHash(hashToken(token));
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= now) {
    return fail(IdentityErrors.linkInvalid());
  }
  if (await deps.directory.findUserByEmail(invitation.email)) return fail(IdentityErrors.emailInUse());

  const passwordHash = await deps.auth.hashPassword(password);
  const userId = newId();
  const ctx: SystemContext = {
    kind: "anonymous",
    requestId: meta.requestId,
    organizationId: invitation.organizationId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  };
  const created = await withTransaction(ctx, async (uow) => {
    const claimed = await uow.tx.invitation.updateMany({
      where: { id: invitation.id, status: "PENDING", expiresAt: { gt: now } },
      data: { status: "ACCEPTED", acceptedAt: now, acceptedUserId: userId },
    });
    if (claimed.count !== 1) return fail(IdentityErrors.linkInvalid());
    try {
      await uow.tx.user.create({
        data: {
          id: userId,
          organizationId: invitation.organizationId,
          name: invitation.name,
          email: invitation.email,
          emailVerified: true,
          role: invitation.role,
          status: "ACTIVE",
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return fail(IdentityErrors.emailInUse());
      throw error;
    }
    await uow.tx.account.create({
      data: { id: newId(), accountId: userId, providerId: "credential", userId, password: passwordHash },
    });
    await uow.audit.record({
      action: "CREATE",
      entityType: "user",
      entityId: userId,
      actorUserId: userId,
      summary: "Usuário criado pelo aceite de convite",
      changes: { role: { before: null, after: invitation.role }, status: { before: null, after: "ACTIVE" } },
      metadata: { invitationId: invitation.id },
    });
    return ok(undefined);
  });
  if (!created.ok) return created;

  const session = await deps.auth.signIn(invitation.email, password, meta);
  if (!session.ok) return fail(CommonErrors.unauthenticated());
  return ok({ redirectTo: homeFor(invitation.role), setCookies: session.setCookies });
}
