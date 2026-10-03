import type { Action } from "@/shared/authz/permissions";

// Sidebar items. Each item declares the permission needed to see it; items are filtered on the
// server before rendering. Later features add their entries here.
// Labels are keys of the shell catalog (shell.navigation.* and shell.groups.*).
export type NavItem = { href: string; labelKey: string; icon: NavIcon; anyOf: Action[] };
export type NavGroup = { labelKey: string; items: NavItem[] };
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
    labelKey: "operation",
    items: [
      {
        href: "/schedule",
        labelKey: "schedule",
        icon: "calendar",
        anyOf: ["schedule:read-all", "schedule:read-own"],
      },
      { href: "/patients", labelKey: "patients", icon: "patients", anyOf: ["patient:read"] },
      { href: "/dashboard", labelKey: "dashboard", icon: "dashboard", anyOf: ["dashboard:read"] },
    ],
  },
  {
    labelKey: "settings",
    items: [
      {
        href: "/settings/organization",
        labelKey: "organization",
        icon: "building",
        anyOf: ["organization:update"],
      },
      { href: "/settings/units", labelKey: "units", icon: "map-pin", anyOf: ["setup:read"] },
      { href: "/settings/services", labelKey: "services", icon: "stethoscope", anyOf: ["setup:read"] },
      // Professional-role users land on their own profile (spec F04 section 4).
      {
        href: "/settings/professionals",
        labelKey: "professionals",
        icon: "contact",
        anyOf: ["professional:read"],
      },
      { href: "/settings/patients", labelKey: "patientLists", icon: "list", anyOf: ["setup:manage"] },
      {
        href: "/settings/schedule",
        labelKey: "cancellationReasons",
        icon: "list",
        anyOf: ["setup:manage"],
      },
      {
        href: "/settings/privacy-terms",
        labelKey: "privacyTerms",
        icon: "shield",
        anyOf: ["lgpd:manage"],
      },
      { href: "/settings/users", labelKey: "users", icon: "users", anyOf: ["user:read"] },
    ],
  },
];
