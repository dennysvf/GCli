import { describe, expect, it } from "vitest";
import { formatLongDate, formatShortDate, weekdayName, weekdayNameOf } from "./calendar-names";

describe("calendar names", () => {
  it("F16: weekday names follow the language, Monday being ISO weekday 1", () => {
    expect(weekdayName("pt-BR", 1)).toBe("segunda-feira");
    expect(weekdayName("en", 1)).toBe("Monday");
    expect(weekdayName("es", 1)).toBe("lunes");
    expect(weekdayName("pt-BR", 7)).toBe("domingo");
    expect(weekdayName("en", 7)).toBe("Sunday");
  });

  it("F16: short names carry no trailing period", () => {
    for (const locale of ["pt-BR", "en", "es"] as const) {
      for (let day = 1; day <= 7; day++) expect(weekdayName(locale, day, "short")).not.toMatch(/\.$/);
    }
  });

  it("F16: a calendar date gives the same weekday in every time zone", () => {
    // 2026-10-06 is a Tuesday; the date has no time zone, so it never shifts.
    expect(weekdayNameOf("2026-10-06", "pt-BR", "long")).toBe("terça-feira");
    expect(weekdayNameOf("2026-10-06", "en", "long")).toBe("Tuesday");
    expect(weekdayNameOf("2026-10-06", "es", "long")).toBe("martes");
  });

  it("F16: long and short dates use the numeric order of the language", () => {
    expect(formatLongDate("2026-10-06", "pt-BR")).toBe("terça-feira, 06/10/2026");
    expect(formatLongDate("2026-10-06", "en")).toBe("Tuesday, 10/06/2026");
    expect(formatLongDate("2026-10-06", "es")).toBe("martes, 06/10/2026");
    expect(formatShortDate("2026-10-06", "pt-BR")).toBe("06/10");
    expect(formatShortDate("2026-10-06", "en")).toBe("10/06");
  });
});
