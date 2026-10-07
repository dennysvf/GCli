import { authorize } from "@/shared/authz/guard";
import type { AnyContext, RequestContext } from "@/shared/context/types";
import { withTransaction, type UnitOfWork } from "@/shared/db/transaction";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/shared/i18n/locales";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { Role } from "@/shared/kernel/roles";
import { parseInput } from "@/shared/kernel/validation";
import { LINKABLE_ROLES, MAX_USERS } from "../domain/policies";
import { IdentityErrors } from "./errors";
import type { IdentityDeps } from "./ports";
import { changeRoleSchema, listUsersSchema, setUserLocaleSchema, userIdSchema } from "./schemas";

export type UserListItem =
  | {
      kind: "user";
      id: string;
      name: string;
      email: string;
      role: Role;
      status: "ACTIVE" | "INACTIVE";
      linkedProfessional: { id: string; name: string } | null;
      lastLoginAt: string | null;
    }
  | {
      kind: "invitation";
      id: string;
      name: string;
      email: string;
      role: Role;
      status: "PENDING" | "EXPIRED";
      expiresAt: string;
    };

export type UserList = { items: UserListItem[]; page: number; pageSize: number; total: number };

const PAGE_SIZE = 50;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// At most 100 users per organization, so filtering happens in memory with accent-insensitive
// matching (spec section 6: no search index needed).
export async function listUsers(
  deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<UserList>> {
  const allowed = await authorize(ctx, "user:read");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(listUsersSchema, input ?? {});
  if (!parsed.ok) return parsed;
  const { search, status, page } = parsed.value;
  const now = deps.clock();

  return withTransaction(ctx, async (uow) => {
    const [users, invitations] = await Promise.all([
      uow.tx.user.findMany({ orderBy: { name: "asc" } }),
      uow.tx.invitation.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" } }),
    ]);
    const links = await deps.professionalLinks().linkedProfessionals(
      ctx.organizationId,
      users.map((user) => user.id),
    );
    const items: UserListItem[] = [
      ...invitations.map((invitation) => ({
        kind: "invitation" as const,
        id: invitation.id,
        name: invitation.name,
        email: invitation.email,
        role: invitation.role as Role,
        status: invitation.expiresAt > now ? ("PENDING" as const) : ("EXPIRED" as const),
        expiresAt: invitation.expiresAt.toISOString(),
      })),
      ...users.map((user) => ({
        kind: "user" as const,
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as Role,
        status: user.status as "ACTIVE" | "INACTIVE",
        linkedProfessional: links.get(user.id) ?? null,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      })),
    ];
    const term = search ? normalize(search) : "";
    const filtered = items.filter((item) => {
      if (term && !normalize(`${item.name} ${item.email}`).includes(term)) return false;
      if (status === "PENDING") return item.kind === "invitation";
      if (status) return item.kind === "user" && item.status === status;
      return true;
    });
    return ok({
      items: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      total: filtered.length,
    });
  });
}

// Locks the organization's active administrators so two concurrent demotions cannot leave the
// organization without one (PRD F01).
async function lockActiveAdministrators(uow: UnitOfWork, organizationId: string): Promise<string[]> {
  const rows = await uow.tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM app_user
    WHERE organization_id = ${organizationId}::uuid AND role = 'ADMINISTRATOR' AND status = 'ACTIVE'
    FOR UPDATE`;
  return rows.map((row) => row.id);
}

// Self-service (PRD F16): every signed-in user may change their own interface language, so the
// only authorization is that the row being changed is the requester's.
export async function setUserLocale(
  _deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ locale: Locale }>> {
  const parsed = parseInput(setUserLocaleSchema, input);
  if (!parsed.ok) return parsed;
  const { locale } = parsed.value;

  return withTransaction(ctx, async (uow) => {
    const user = await uow.tx.user.findFirst({ where: { id: ctx.user.id } });
    if (!user) return fail(IdentityErrors.userNotFound());
    if (user.locale === locale) return ok({ locale });
    await uow.tx.user.update({ where: { id: user.id }, data: { locale, version: { increment: 1 } } });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "user",
      entityId: user.id,
      summary: "Idioma alterado",
      changes: { locale: { before: user.locale, after: locale } },
    });
    return ok({ locale });
  });
}

export async function changeUserRole(
  deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ role: Role }>> {
  const allowed = await authorize(ctx, "user:update-role");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(changeRoleSchema, input);
  if (!parsed.ok) return parsed;
  const { userId, role } = parsed.value;

  return withTransaction(ctx, async (uow) => {
    const admins = await lockActiveAdministrators(uow, ctx.organizationId);
    const user = await uow.tx.user.findFirst({ where: { id: userId } });
    if (!user) return fail(IdentityErrors.userNotFound());
    if (user.role === role) return ok({ role });
    if (user.role === "ADMINISTRATOR" && user.status === "ACTIVE" && admins.length <= 1) {
      return fail(IdentityErrors.lastAdmin());
    }
    await uow.tx.user.update({ where: { id: user.id }, data: { role, version: { increment: 1 } } });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "user",
      entityId: user.id,
      summary: "Perfil alterado",
      changes: { role: { before: user.role, after: role } },
    });
    return ok({ role });
  });
}

export async function deactivateUser(
  deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ status: "INACTIVE" }>> {
  const allowed = await authorize(ctx, "user:deactivate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(userIdSchema, input);
  if (!parsed.ok) return parsed;
  const { userId } = parsed.value;
  if (userId === ctx.user.id) return fail(IdentityErrors.selfDeactivation());

  return withTransaction(ctx, async (uow) => {
    const admins = await lockActiveAdministrators(uow, ctx.organizationId);
    const user = await uow.tx.user.findFirst({ where: { id: userId } });
    if (!user) return fail(IdentityErrors.userNotFound());
    if (user.status === "INACTIVE") return ok({ status: "INACTIVE" as const });
    if (user.role === "ADMINISTRATOR" && admins.length <= 1) return fail(IdentityErrors.lastAdmin());

    await uow.tx.user.update({
      where: { id: user.id },
      data: { status: "INACTIVE", deactivatedAt: deps.clock(), version: { increment: 1 } },
    });
    // PRD F01: a deactivated user loses access immediately.
    await uow.tx.session.deleteMany({ where: { userId: user.id } });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "user",
      entityId: user.id,
      summary: "Usuário desativado",
      changes: { status: { before: "ACTIVE", after: "INACTIVE" } },
    });
    return ok({ status: "INACTIVE" as const });
  });
}

export async function reactivateUser(
  deps: IdentityDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ status: "ACTIVE" }>> {
  const allowed = await authorize(ctx, "user:deactivate");
  if (!allowed.ok) return allowed;
  const parsed = parseInput(userIdSchema, input);
  if (!parsed.ok) return parsed;
  const now = deps.clock();

  return withTransaction(ctx, async (uow) => {
    const user = await uow.tx.user.findFirst({ where: { id: parsed.value.userId } });
    if (!user) return fail(IdentityErrors.userNotFound());
    if (user.status === "ACTIVE") return ok({ status: "ACTIVE" as const });
    const [active, pending] = await Promise.all([
      uow.tx.user.count({ where: { status: "ACTIVE" } }),
      uow.tx.invitation.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
    ]);
    if (active + pending >= MAX_USERS) return fail(IdentityErrors.userLimit());
    await uow.tx.user.update({
      where: { id: user.id },
      data: {
        status: "ACTIVE",
        deactivatedAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
        version: { increment: 1 },
      },
    });
    await uow.audit.record({
      action: "UPDATE",
      entityType: "user",
      entityId: user.id,
      summary: "Usuário reativado",
      changes: { status: { before: "INACTIVE", after: "ACTIVE" } },
    });
    return ok({ status: "ACTIVE" as const });
  });
}

export type LinkableUser = { id: string; name: string; email: string; role: Role; isActive: true };

// Provided to F04 for linking a user to a professional profile.
export async function listLinkableUsers(ctx: RequestContext): Promise<LinkableUser[]> {
  const result = await withTransaction(ctx, async (uow) => {
    const users = await uow.tx.user.findMany({
      where: { status: "ACTIVE", role: { in: [...LINKABLE_ROLES] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    });
    return ok(users.map((user) => ({ ...user, role: user.role as Role, isActive: true as const })));
  });
  return result.ok ? result.value : [];
}

// Display names for author columns in other modules (e.g. F03 price history). Includes
// deactivated users, since history keeps showing who made each change.
export async function getUserNames(ctx: RequestContext, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const result = await withTransaction(ctx, async (uow) =>
    ok(await uow.tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })),
  );
  return new Map(result.ok ? result.value.map((user) => [user.id, user.name]) : []);
}

export type AdministratorContact = { name: string; email: string; locale: Locale };

// Active administrators and the language of their emails (PRD F16): the user's own, else the
// organization's. Provided to F08 for the storage quota alert.
export async function listAdministratorContacts(ctx: AnyContext): Promise<AdministratorContact[]> {
  const result = await withTransaction(ctx, async (uow) => {
    const [organization, admins] = await Promise.all([
      uow.tx.organization.findFirst({ select: { defaultLocale: true } }),
      uow.tx.user.findMany({
        where: { role: "ADMINISTRATOR", status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { name: true, email: true, locale: true },
      }),
    ]);
    const fallback = isLocale(organization?.defaultLocale) ? organization.defaultLocale : DEFAULT_LOCALE;
    return ok(
      admins.map((admin) => ({
        name: admin.name,
        email: admin.email,
        locale: isLocale(admin.locale) ? admin.locale : fallback,
      })),
    );
  });
  return result.ok ? result.value : [];
}
