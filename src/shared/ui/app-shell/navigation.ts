import type { Action } from "@/shared/authz/permissions";

// Sidebar items. Each item declares the permission needed to see it; items are filtered on the
// server before rendering. Later features add their entries here.
export type NavItem = { href: string; label: string; icon: NavIcon; anyOf: Action[] };
export type NavGroup = { label: string; items: NavItem[] };
export type NavIcon =
  | "calendar"
  | "dashboard"
  | "building"
  | "users"
  | "map-pin"
  | "stethoscope"
  | "contact"
  | "patients"
  | "list"
  | "shield";

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
      { href: "/patients", label: "Pacientes", icon: "patients", anyOf: ["patient:read"] },
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
      { href: "/settings/units", label: "Unidades", icon: "map-pin", anyOf: ["setup:read"] },
      { href: "/settings/services", label: "Serviços", icon: "stethoscope", anyOf: ["setup:read"] },
      // Professional-role users land on their own profile (spec F04 section 4).
      {
        href: "/settings/professionals",
        label: "Profissionais",
        icon: "contact",
        anyOf: ["professional:read"],
      },
      { href: "/settings/patients", label: "Listas de pacientes", icon: "list", anyOf: ["setup:manage"] },
      {
        href: "/settings/privacy-terms",
        label: "Termos de privacidade",
        icon: "shield",
        anyOf: ["lgpd:manage"],
      },
      { href: "/settings/users", label: "Usuários", icon: "users", anyOf: ["user:read"] },
    ],
  },
];
