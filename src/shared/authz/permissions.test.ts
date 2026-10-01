import { describe, expect, it } from "vitest";
import { ROLES } from "@/shared/kernel/roles";
import { can, PERMISSIONS, roleCan, type Action } from "./permissions";

// Expected matrix from PRD F01 (Capabilities) for the areas F01 enforces directly.
const EXPECTED: Record<string, Record<(typeof ROLES)[number], boolean>> = {
  "organization:update": { ADMINISTRATOR: true, MANAGER: false, FRONT_DESK: false, PROFESSIONAL: false },
  "user:read": { ADMINISTRATOR: true, MANAGER: true, FRONT_DESK: false, PROFESSIONAL: false },
  "user:invite": { ADMINISTRATOR: true, MANAGER: false, FRONT_DESK: false, PROFESSIONAL: false },
  "user:update-role": { ADMINISTRATOR: true, MANAGER: false, FRONT_DESK: false, PROFESSIONAL: false },
  "user:deactivate": { ADMINISTRATOR: true, MANAGER: false, FRONT_DESK: false, PROFESSIONAL: false },
  "audit:read": { ADMINISTRATOR: true, MANAGER: false, FRONT_DESK: false, PROFESSIONAL: false },
  "clinical:read": { ADMINISTRATOR: false, MANAGER: false, FRONT_DESK: false, PROFESSIONAL: true },
  "dashboard:read": { ADMINISTRATOR: true, MANAGER: true, FRONT_DESK: false, PROFESSIONAL: false },
  "billing:approve": { ADMINISTRATOR: true, MANAGER: true, FRONT_DESK: false, PROFESSIONAL: false },
  "billing:operate": { ADMINISTRATOR: true, MANAGER: true, FRONT_DESK: true, PROFESSIONAL: false },
  "professional:read-all": { ADMINISTRATOR: true, MANAGER: true, FRONT_DESK: true, PROFESSIONAL: false },
  "professional:manage": { ADMINISTRATOR: true, MANAGER: true, FRONT_DESK: false, PROFESSIONAL: false },
  "professional:manage-own-time-off": {
    ADMINISTRATOR: false,
    MANAGER: false,
    FRONT_DESK: false,
    PROFESSIONAL: true,
  },
};

const user = (role: (typeof ROLES)[number]) => ({ id: "u", name: "U", email: "u@x", role });

describe("permission matrix", () => {
  it("F01: each role maps to the PRD matrix", () => {
    for (const [action, byRole] of Object.entries(EXPECTED)) {
      for (const role of ROLES) {
        expect(roleCan(role, action as Action), `${role} ${action}`).toBe(byRole[role]);
      }
    }
  });

  it("F01: front desk never gets clinical access", () => {
    expect(can({ user: user("FRONT_DESK"), linkedProfessionalId: null }, "clinical:read")).toBe(false);
  });

  it("F01: an administrator linked to a professional profile gains clinical access", () => {
    expect(can({ user: user("ADMINISTRATOR"), linkedProfessionalId: null }, "clinical:read")).toBe(false);
    expect(can({ user: user("ADMINISTRATOR"), linkedProfessionalId: "p1" }, "clinical:read")).toBe(true);
    expect(can({ user: user("MANAGER"), linkedProfessionalId: "p1" }, "clinical:write")).toBe(true);
  });

  it("declares every action with at least one role", () => {
    for (const roles of Object.values(PERMISSIONS)) expect(roles.length).toBeGreaterThan(0);
  });
});
