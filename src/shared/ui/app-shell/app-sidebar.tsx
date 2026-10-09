"use client";

import {
  Building2,
  CalendarDays,
  Contact,
  FileText,
  ListChecks,
  ShieldCheck,
  Package,
  Wallet,
  UsersRound,
  LayoutDashboard,
  MapPin,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/components/sidebar";
import type { NavGroup, NavIcon } from "./navigation";

const ICONS: Record<NavIcon, LucideIcon> = {
  calendar: CalendarDays,
  dashboard: LayoutDashboard,
  building: Building2,
  users: Users,
  "map-pin": MapPin,
  stethoscope: Stethoscope,
  contact: Contact,
  patients: UsersRound,
  list: ListChecks,
  "file-text": FileText,
  shield: ShieldCheck,
  wallet: Wallet,
  package: Package,
};

// Receives only the groups and items the signed-in role may see (filtered on the server).
export function AppSidebar({ groups, organizationName }: { groups: NavGroup[]; organizationName: string }) {
  const pathname = usePathname();
  const t = useTranslations("shell");
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 py-1.5">
          <p className="text-lg font-semibold">GCli</p>
          <p className="text-muted-foreground truncate text-xs">{organizationName}</p>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.labelKey}>
            <SidebarGroupLabel>{t(`groups.${group.labelKey}`)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link href={item.href}>
                          <Icon />
                          <span>{t(`navigation.${item.labelKey}`)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
