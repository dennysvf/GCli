import { describe, expect, it } from "vitest";
import { councilLabel, formatRegistration } from "./council";
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
  const registration = {
    country: "BR" as const,
    councilType: "CRM",
    councilOtherName: null,
    number: "123456",
    region: "SP",
    npi: null,
  };

  it("F04: registration is formatted as CRM 123456/SP", () => {
    expect(formatRegistration(registration, "CRM")).toBe("CRM 123456/SP");
    expect(
      formatRegistration(
        { ...registration, councilType: "OTHER", councilOtherName: "CRFa", number: "1234" },
        "CRFa",
      ),
    ).toBe("CRFa 1234/SP");
  });

  it("F16: registrations of other countries have no region or add the US NPI", () => {
    expect(
      formatRegistration(
        { ...registration, country: "PT", councilType: "ORDEM_MEDICOS", number: "12345", region: null },
        "Ordem dos Médicos",
      ),
    ).toBe("Ordem dos Médicos 12345");
    expect(
      formatRegistration(
        {
          ...registration,
          country: "US",
          councilType: "STATE_LICENSE",
          number: "A1234",
          region: "NY",
          npi: "1234567893",
        },
        "State license",
      ),
    ).toBe("State license A1234/NY · NPI 1234567893");
    expect(
      formatRegistration(
        { ...registration, country: "US", councilType: "NPI", number: null, region: null, npi: "1234567893" },
        "NPI",
      ),
    ).toBe("NPI 1234567893");
  });

  it("the label is the council's name for Outro and the type label otherwise", () => {
    expect(councilLabel({ councilType: "CRM", councilOtherName: null }, "CRM")).toBe("CRM");
    expect(councilLabel({ councilType: "OTHER", councilOtherName: "CRFa" }, "Outro")).toBe("CRFa");
  });
});
