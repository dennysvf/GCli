import { describe, expect, it } from "vitest";
import { APPOINTMENT_STATUSES, nextStatuses, occupiesSlot, resolveTransition } from "./status";

describe("appointment status", () => {
  it("F06: status transitions follow the lifecycle", () => {
    const allowed = new Set([
      "SCHEDULED>CONFIRMED",
      "CONFIRMED>SCHEDULED",
      "SCHEDULED>CHECKED_IN",
      "CONFIRMED>CHECKED_IN",
      "CHECKED_IN>CONFIRMED",
      "CHECKED_IN>IN_PROGRESS",
      "IN_PROGRESS>COMPLETED",
      "COMPLETED>IN_PROGRESS",
      "SCHEDULED>NO_SHOW",
      "CONFIRMED>NO_SHOW",
      "SCHEDULED>CANCELLED",
      "CONFIRMED>CANCELLED",
    ]);
    for (const from of APPOINTMENT_STATUSES) {
      for (const to of APPOINTMENT_STATUSES) {
        expect(resolveTransition(from, to) !== null, `${from} → ${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
    expect(resolveTransition("CHECKED_IN", "CONFIRMED")).toBe("UNDO_CHECK_IN");
    expect(resolveTransition("COMPLETED", "IN_PROGRESS")).toBe("REVERT_COMPLETION");
    expect(nextStatuses("NO_SHOW")).toEqual([]);
    expect(nextStatuses("CANCELLED")).toEqual([]);
  });

  it("F06: cancelled and no-show appointments do not occupy the slot", () => {
    expect(occupiesSlot("CANCELLED")).toBe(false);
    expect(occupiesSlot("NO_SHOW")).toBe(false);
    expect(occupiesSlot("COMPLETED")).toBe(true);
    expect(occupiesSlot("SCHEDULED")).toBe(true);
  });
});
