import { describe, expect, it } from "vitest";
import { localMinuteToUtc, utcOffsetMinutes, utcToZonedParts, zonedTimeToUtc } from "./zoned-time";

describe("zoned time", () => {
  it("converts local wall-clock times to instants and back", () => {
    const instant = zonedTimeToUtc("2026-10-06T14:30", "America/Sao_Paulo");
    expect(instant.toISOString()).toBe("2026-10-06T17:30:00.000Z");
    expect(utcToZonedParts(instant, "America/Manaus")).toEqual({ date: "2026-10-06", minute: 13 * 60 + 30 });
    expect(utcOffsetMinutes("America/Manaus", instant)).toBe(-240);
  });

  it("adds minutes from local midnight, including the end of the day", () => {
    expect(localMinuteToUtc("2026-10-06", 600, "America/Sao_Paulo").toISOString()).toBe(
      "2026-10-06T13:00:00.000Z",
    );
    expect(localMinuteToUtc("2026-10-06", 1440, "America/Sao_Paulo").toISOString()).toBe(
      "2026-10-07T03:00:00.000Z",
    );
  });
});
