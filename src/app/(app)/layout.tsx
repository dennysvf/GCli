import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { identity } from "@/modules/identity";
import { GlobalPatientSearch } from "@/modules/patients";
import { units, UnitSelector } from "@/modules/units";
import { requireRequestContext } from "@/modules/identity/next";
import { can } from "@/shared/authz/permissions";
import { SidebarInset, SidebarProvider } from "@/shared/ui/components/sidebar";
import { AppHeader } from "@/shared/ui/app-shell/app-header";
import { AppSidebar } from "@/shared/ui/app-shell/app-sidebar";
import { NAVIGATION } from "@/shared/ui/app-shell/navigation";
import { QueryProvider } from "@/shared/ui/query/query-provider";
import { UserMenu } from "@/shared/ui/app-shell/user-menu";
import { setUserLocaleAction, signOutAction } from "./actions";
import { selectUnitAction } from "./settings/units/actions";

// Authenticated shell (spec F01 section 2): every page under (app) requires a valid session.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireRequestContext();
  const [organizationName, activeUnits, selectedUnit] = await Promise.all([
    identity.organizationName(ctx),
    units.listUnits(ctx, { activeOnly: true }),
    units.getSelectedUnit(ctx),
  ]);
  const t = await getTranslations("shell");
  const groups = NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.anyOf.some((action) => can(ctx, action))),
  })).filter((group) => group.items.length > 0);

  // Times in client components follow the selected unit's zone, else the organization's (ADR-019).
  const timeZone = selectedUnit?.timeZone;
  return (
    <NextIntlClientProvider {...(timeZone ? { timeZone } : {})}>
      <SidebarProvider>
        {/* Design system 8: the first focusable element skips to the content. */}
        <a
          href="#conteudo"
          className="bg-card sr-only z-50 px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t("skipToContent")}
        </a>
        <AppSidebar groups={groups} organizationName={organizationName ?? ""} />
        <SidebarInset className="bg-card">
          <AppHeader
            unitSelector={
              <UnitSelector
                units={activeUnits.ok ? activeUnits.value.map(({ id, name }) => ({ id, name })) : []}
                selectedId={selectedUnit?.id ?? null}
                canManage={can(ctx, "setup:manage")}
                action={selectUnitAction}
              />
            }
            search={
              can(ctx, "patient:read") ? (
                <GlobalPatientSearch canRegister={can(ctx, "patient:manage")} />
              ) : null
            }
            userMenu={
              <UserMenu
                name={ctx.user.name}
                email={ctx.user.email}
                role={ctx.user.role}
                locale={ctx.locale}
                signOutAction={signOutAction}
                setLocaleAction={setUserLocaleAction}
              />
            }
          />
          {/* Design system 4.2: content is at most 1280 px wide; the agenda uses the full width. */}
          <div
            id="conteudo"
            className="flex w-full max-w-(--content-max-width) flex-1 flex-col p-4 has-data-full-width:max-w-none md:p-8"
          >
            <QueryProvider>{children}</QueryProvider>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </NextIntlClientProvider>
  );
}
