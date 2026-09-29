import type { Action } from "@/shared/authz/permissions";

// Sidebar items. Each item declares the permission needed to see it; items are filtered on the
// server before rendering. Later features add their entries here.
export type NavItem = { href: string; label: string; icon: NavIcon; anyOf: Action[] };
export type NavGroup = { label: string; items: NavItem[] };
export type NavIcon = "calendar" | "dashboard" | "building" | "users";

export const NAVIGATION: NavGroup[] = [
  {
    label: "Operação",
    items: [
      {
        href: "/schedule",
        label: "Agenda",
        icon: "calendar",
        anyOf: ["schedule:read-all", "schedule:read-own"],
      },
      { href: "/dashboard", label: "Painel", icon: "dashboard", anyOf: ["dashboard:read"] },
    ],
  },
  {
    label: "Configurações",
    items: [
      {
        href: "/settings/organization",
        label: "Organização",
        icon: "building",
        anyOf: ["organization:update"],
      },
      { href: "/settings/users", label: "Usuários", icon: "users", anyOf: ["user:read"] },
    ],
  },
];
