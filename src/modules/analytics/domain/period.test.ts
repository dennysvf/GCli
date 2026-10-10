import { describe, expect, it } from "vitest";
import { periodDays, previousPeriod, resolvePeriod } from "./period";

describe("dashboard period", () => {
  it("F12: presets resolve to the right range in the anchor time zone", () => {
    const today = "2026-10-10";
    expect(resolvePeriod("TODAY", today)).toEqual({ from: "2026-10-10", to: "2026-10-10" });
    expect(resolvePeriod("LAST_7_DAYS", today)).toEqual({ from: "2026-10-04", to: "2026-10-10" });
    expect(resolvePeriod("LAST_30_DAYS", today)).toEqual({ from: "2026-09-11", to: "2026-10-10" });
    expect(resolvePeriod("CURRENT_MONTH", today)).toEqual({ from: "2026-10-01", to: "2026-10-10" });
    expect(resolvePeriod("PREVIOUS_MONTH", today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod("PREVIOUS_MONTH", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(resolvePeriod("CUSTOM", today, { from: "2026-01-01", to: "2026-02-01" })).toEqual({
      from: "2026-01-01",
      to: "2026-02-01",
    });
  });

  it("F12: previous period of the current month is capped at the last day of the previous month", () => {
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" }, "CURRENT_MONTH")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(previousPeriod({ from: "2026-10-01", to: "2026-10-10" }, "CURRENT_MONTH")).toEqual({
      from: "2026-09-01",
      to: "2026-09-10",
    });
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" }, "PREVIOUS_MONTH")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  it("F12: previous period of a custom range has the same length right before it", () => {
    const previous = previousPeriod({ from: "2026-09-01", to: "2026-09-30" }, "CUSTOM");
    expect(previous).toEqual({ from: "2026-08-02", to: "2026-08-31" });
    expect(periodDays(previous)).toBe(30);
    expect(previousPeriod({ from: "2026-10-10", to: "2026-10-10" }, "TODAY")).toEqual({
      from: "2026-10-09",
      to: "2026-10-09",
    });
    expect(previousPeriod({ from: "2026-10-04", to: "2026-10-10" }, "LAST_7_DAYS")).toEqual({
      from: "2026-09-27",
      to: "2026-10-03",
    });
  });
});
