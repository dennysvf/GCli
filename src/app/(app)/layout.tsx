import { identity } from "@/modules/identity";
import { requireRequestContext } from "@/modules/identity/next";
import { can } from "@/shared/authz/permissions";
import { SidebarInset, SidebarProvider } from "@/shared/ui/components/sidebar";
import { AppHeader } from "@/shared/ui/app-shell/app-header";
import { AppSidebar } from "@/shared/ui/app-shell/app-sidebar";
import { NAVIGATION } from "@/shared/ui/app-shell/navigation";
import { UserMenu } from "@/shared/ui/app-shell/user-menu";
import { signOutAction } from "./actions";

// Authenticated shell (spec F01 section 2): every page under (app) requires a valid session.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireRequestContext();
  const organizationName = (await identity.organizationName(ctx)) ?? "";
  const groups = NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.anyOf.some((action) => can(ctx, action))),
  })).filter((group) => group.items.length > 0);

  return (
    <SidebarProvider>
      <AppSidebar groups={groups} organizationName={organizationName} />
      <SidebarInset>
        <AppHeader
          userMenu={
            <UserMenu
              name={ctx.user.name}
              email={ctx.user.email}
              role={ctx.user.role}
              signOutAction={signOutAction}
            />
          }
        />
        <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
