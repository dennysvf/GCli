import { describe, expect, it } from "vitest";
import { resolveAuditPeriod } from "./period";

const ZONE = "America/Sao_Paulo";

describe("audit period", () => {
  it("F15: the period window uses the organization's time zone and includes the end date", () => {
    const period = resolveAuditPeriod({ from: "2026-10-01", to: "2026-10-18" }, "2026-10-21", ZONE);
    if (!period.ok) throw new Error(period.error.code);
    // São Paulo is UTC-3: local midnight is 03:00 UTC, and the end date counts until the next midnight.
    expect(period.value.windowStart.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(period.value.windowEnd.toISOString()).toBe("2026-10-19T03:00:00.000Z");
  });

  it("F15: without dates the period is the last 30 days including today", () => {
    const period = resolveAuditPeriod({}, "2026-10-21", ZONE);
    if (!period.ok) throw new Error(period.error.code);
    expect(period.value).toMatchObject({ from: "2026-09-22", to: "2026-10-21" });
  });

  it("F15: a period of 367 days or ending before it starts is rejected", () => {
    const longest = resolveAuditPeriod({ from: "2025-10-21", to: "2026-10-21" }, "2026-10-21", ZONE);
    expect(longest.ok).toBe(true);
    const tooLong = resolveAuditPeriod({ from: "2025-10-20", to: "2026-10-21" }, "2026-10-21", ZONE);
    expect(tooLong.ok ? null : tooLong.error.code).toBe("AUDIT_PERIOD_TOO_LONG");
    const reversed = resolveAuditPeriod({ from: "2026-10-10", to: "2026-10-09" }, "2026-10-21", ZONE);
    expect(reversed.ok ? null : reversed.error.code).toBe("AUDIT_PERIOD_INVALID");
  });
});
