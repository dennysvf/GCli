import { describe, expect, it } from "vitest";
import { formatRegistration, requiresOtherName, requiresRegistration } from "./council";
import { checkTimeOff, isTimeOffDeletable, timeOffRange } from "./time-offs";

const NOW = new Date("2026-10-01T12:00:00Z");

describe("time-offs", () => {
  it("F04: all-day time-offs cover whole days in the organization's time zone", () => {
    const range = timeOffRange(
      { allDay: true, startsAt: "2026-12-21", endsAt: "2027-01-04" },
      "America/Sao_Paulo",
    );
    expect(range.startsAt.toISOString()).toBe("2026-12-21T03:00:00.000Z");
    expect(range.endsAt.toISOString()).toBe("2027-01-05T03:00:00.000Z");

    const partial = timeOffRange(
      { allDay: false, startsAt: "2026-10-10T08:00", endsAt: "2026-10-10T12:30" },
      "America/Manaus",
    );
    expect(partial.startsAt.toISOString()).toBe("2026-10-10T12:00:00.000Z");
    expect(partial.endsAt.toISOString()).toBe("2026-10-10T16:30:00.000Z");
  });

  it("F04: time-offs must end within one year", () => {
    const start = new Date("2026-10-02T00:00:00Z");
    const inAYear = new Date(NOW.getTime() + 365 * 86_400_000);
    expect(checkTimeOff({ startsAt: start, endsAt: inAYear }, NOW)).toBeNull();
    expect(checkTimeOff({ startsAt: start, endsAt: new Date(inAYear.getTime() + 86_400_000) }, NOW)).toBe(
      "TOO_FAR",
    );
    expect(checkTimeOff({ startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: NOW }, NOW)).toBe(
      "ENDS_IN_PAST",
    );
    expect(checkTimeOff({ startsAt: start, endsAt: new Date(start.getTime() + 60_000) }, NOW)).toBe(
      "TOO_SHORT",
    );
  });

  it("only time-offs that have not ended can be deleted", () => {
    expect(isTimeOffDeletable(new Date("2026-10-01T13:00:00Z"), NOW)).toBe(true);
    expect(isTimeOffDeletable(new Date("2026-10-01T11:00:00Z"), NOW)).toBe(false);
  });
});

describe("council registration", () => {
  it("F04: council registration is required unless the type is none", () => {
    expect(requiresRegistration("NONE")).toBe(false);
    expect(requiresRegistration("CRM")).toBe(true);
    expect(requiresRegistration("OTHER")).toBe(true);
    expect(requiresOtherName("OTHER")).toBe(true);
    expect(requiresOtherName("CRP")).toBe(false);
  });

  it("F04: registration is formatted as CRM 123456/SP", () => {
    expect(formatRegistration({ type: "CRM", otherName: null, number: "123456", state: "SP" })).toBe(
      "CRM 123456/SP",
    );
    expect(formatRegistration({ type: "OTHER", otherName: "CRFa", number: "1234", state: "SP" })).toBe(
      "CRFa 1234/SP",
    );
    expect(formatRegistration({ type: "NONE", otherName: null, number: null, state: null })).toBe("");
  });
});
