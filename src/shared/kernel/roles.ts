// The four fixed roles of PRD F01.
export const ROLES = ["ADMINISTRATOR", "MANAGER", "FRONT_DESK", "PROFESSIONAL"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
