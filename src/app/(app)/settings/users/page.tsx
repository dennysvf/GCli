import { PageHeader } from "@/shared/ui/app-shell/page-header";
import type { Metadata } from "next";
import Link from "next/link";
import { getOrganizationProfile, identity, InviteUserDialog, UsersTable } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import { can } from "@/shared/authz/permissions";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import {
  changeUserRoleAction,
  deactivateUserAction,
  inviteUserAction,
  reactivateUserAction,
  resendInvitationAction,
  revokeInvitationAction,
} from "./actions";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage({ searchParams }: PageProps<"/settings/users">) {
  const ctx = await requirePermission("user:read");
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q : undefined;
  const page = typeof params.page === "string" ? params.page : "1";
  const result = await identity.listUsers(ctx, { search, page });
  const list = result.ok ? result.value : { items: [], page: 1, pageSize: 50, total: 0 };
  const canManage = can(ctx, "user:invite");
  // The invitation language starts as the organization default (PRD F16).
  const organization = await getOrganizationProfile(ctx);
  const defaultLocale = organization.ok ? organization.value.defaultLocale : ctx.locale;
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Usuários"
        actions={
          canManage ? <InviteUserDialog action={inviteUserAction} defaultLocale={defaultLocale} /> : null
        }
      />
      <form className="flex max-w-md gap-2" role="search">
        <Input
          name="q"
          defaultValue={search}
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar usuários"
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      <UsersTable
        items={list.items}
        canManage={canManage}
        currentUserId={ctx.user.id}
        actions={{
          changeRole: changeUserRoleAction,
          deactivate: deactivateUserAction,
          reactivate: reactivateUserAction,
          resend: resendInvitationAction,
          revoke: revokeInvitationAction,
        }}
      />
      {pages > 1 ? (
        <nav className="flex items-center gap-2 text-sm" aria-label="Paginação">
          {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              href={{ query: { ...(search ? { q: search } : {}), page: number } }}
              aria-current={number === list.page ? "page" : undefined}
              className={number === list.page ? "font-semibold" : "text-muted-foreground"}
            >
              {number}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
