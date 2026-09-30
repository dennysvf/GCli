import type { Metadata } from "next";
import Link from "next/link";
import { identity, InviteUserDialog, UsersTable } from "@/modules/identity";
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
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        {canManage ? <InviteUserDialog action={inviteUserAction} /> : null}
      </div>
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
