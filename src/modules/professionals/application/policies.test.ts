import { describe, expect, it } from "vitest";
import type { Role } from "@/shared/kernel/roles";
import { canManageTimeOff, canViewProfessional } from "./policies";

const ctx = (role: Role, linkedProfessionalId: string | null = null) => ({
  user: { id: "u", name: "U", email: "u@x", role },
  linkedProfessionalId,
});

describe("professional policies", () => {
  it("F04: a professional may manage only their own time-offs", () => {
    expect(canManageTimeOff(ctx("PROFESSIONAL", "p1"), "p1")).toBe(true);
    expect(canManageTimeOff(ctx("PROFESSIONAL", "p1"), "p2")).toBe(false);
    expect(canManageTimeOff(ctx("PROFESSIONAL"), "p1")).toBe(false);
    expect(canManageTimeOff(ctx("MANAGER"), "p2")).toBe(true);
    expect(canManageTimeOff(ctx("ADMINISTRATOR"), "p2")).toBe(true);
    expect(canManageTimeOff(ctx("FRONT_DESK"), "p1")).toBe(false);
  });

  it("F04: professional-role users can view only their own profile", () => {
    expect(canViewProfessional(ctx("PROFESSIONAL", "p1"), "p1")).toBe(true);
    expect(canViewProfessional(ctx("PROFESSIONAL", "p1"), "p2")).toBe(false);
    expect(canViewProfessional(ctx("PROFESSIONAL"), "p1")).toBe(false);
    expect(canViewProfessional(ctx("FRONT_DESK"), "p2")).toBe(true);
    expect(canViewProfessional(ctx("MANAGER"), "p2")).toBe(true);
    expect(canViewProfessional(ctx("ADMINISTRATOR"), "p2")).toBe(true);
  });
});
