import type { RequestContext } from "@/shared/context/types";
import type { Role } from "@/shared/kernel/roles";

// Permission matrix of PRD F01 for every module, so later features only reference actions.
// Resource-level rules (e.g. "professional has an appointment with this patient") are policy
// functions in each module; this matrix answers "may this role perform this kind of action".
export const PERMISSIONS = {
  // F01 organization settings and users
  "organization:read": ["ADMINISTRATOR", "MANAGER", "FRONT_DESK", "PROFESSIONAL"],
  "organization:update": ["ADMINISTRATOR"],
  "user:read": ["ADMINISTRATOR", "MANAGER"],
  "user:invite": ["ADMINISTRATOR"],
  "user:update-role": ["ADMINISTRATOR"],
  "user:deactivate": ["ADMINISTRATOR"],
  // F02, F03, F08 templates: units, rooms, services, document templates
  "setup:read": ["ADMINISTRATOR", "MANAGER", "FRONT_DESK", "PROFESSIONAL"],
  "setup:manage": ["ADMINISTRATOR", "MANAGER"],
  // F04 professionals and working hours (professionals manage only their own time-offs)
  "professional:read": ["ADMINISTRATOR", "MANAGER", "FRONT_DESK", "PROFESSIONAL"],
  // Every profile; Professional-role users read only their own (spec F04 section 3).
  "professional:read-all": ["ADMINISTRATOR", "MANAGER", "FRONT_DESK"],
  "professional:manage": ["ADMINISTRATOR", "MANAGER"],
  "professional:manage-own-time-off": ["PROFESSIONAL"],
  // F05 patients (professionals only see patients with an appointment with them)
  "patient:read": ["ADMINISTRATOR", "MANAGER", "FRONT_DESK", "PROFESSIONAL"],
  "patient:manage": ["ADMINISTRATOR", "MANAGER", "FRONT_DESK"],
  // F06 agenda
  "schedule:read-all": ["ADMINISTRATOR", "MANAGER", "FRONT_DESK"],
  "schedule:read-own": ["PROFESSIONAL"],
  "schedule:manage": ["ADMINISTRATOR", "MANAGER", "FRONT_DESK"],
  "schedule:update-own-status": ["PROFESSIONAL"],
  // Booking outside working or business hours, and reverting a completion at any time (PRD F06).
  "schedule:override-availability": ["ADMINISTRATOR", "MANAGER"],
  "schedule:revert-completion": ["ADMINISTRATOR", "MANAGER"],
  // F07 clinical records: professionals, plus administrators/managers linked to a professional
  "clinical:read": ["PROFESSIONAL"],
  "clinical:write": ["PROFESSIONAL"],
  // F09, F10, F11 billing, packages, cash
  "billing:operate": ["ADMINISTRATOR", "MANAGER", "FRONT_DESK"],
  "billing:approve": ["ADMINISTRATOR", "MANAGER"],
  // F12, F13 dashboard and reports
  "dashboard:read": ["ADMINISTRATOR", "MANAGER"],
  "report:read": ["ADMINISTRATOR", "MANAGER"],
  // F14, F15 LGPD and audit log
  "lgpd:manage": ["ADMINISTRATOR"],
  "audit:read": ["ADMINISTRATOR"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof PERMISSIONS;

// Actions a user linked to a professional profile gains regardless of role (PRD F01).
const LINKED_PROFESSIONAL_ACTIONS: readonly Action[] = [
  "clinical:read",
  "clinical:write",
  "schedule:read-own",
  "schedule:update-own-status",
  "professional:manage-own-time-off",
];

export function roleCan(role: Role, action: Action): boolean {
  return (PERMISSIONS[action] as readonly Role[]).includes(role);
}

export function can(ctx: Pick<RequestContext, "user" | "linkedProfessionalId">, action: Action): boolean {
  if (roleCan(ctx.user.role, action)) return true;
  return ctx.linkedProfessionalId !== null && LINKED_PROFESSIONAL_ACTIONS.includes(action);
}
