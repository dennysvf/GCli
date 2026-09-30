import { describe, expect, it } from "vitest";
import { closedWeek, isWithinHours, normalizeWeek, validateWeek, type Week } from "./business-hours";

function weekWith(weekday: number, open: boolean, intervals: { start: number; end: number }[]): Week {
  return closedWeek().map((day) => (day.weekday === weekday ? { weekday, open, intervals } : day));
}

describe("business hours", () => {
  it("F02: business hours accept up to two ordered intervals per day", () => {
    expect(validateWeek(closedWeek())).toBeNull();
    expect(validateWeek(weekWith(1, true, [{ start: 480, end: 720 }]))).toBeNull();
    expect(
      validateWeek(
        weekWith(1, true, [
          { start: 420, end: 720 },
          { start: 780, end: 1440 },
        ]),
      ),
    ).toBeNull();
  });

  it("F02: overlapping, reversed, or off-grid intervals are rejected", () => {
    const overlap = validateWeek(
      weekWith(2, true, [
        { start: 480, end: 720 },
        { start: 700, end: 900 },
      ]),
    );
    expect(overlap?.["days.1"]).toBe("Terça: o segundo intervalo deve começar depois do fim do primeiro.");
    expect(validateWeek(weekWith(1, true, [{ start: 720, end: 480 }]))?.["days.0"]).toContain("anterior");
    expect(validateWeek(weekWith(1, true, [{ start: 481, end: 720 }]))?.["days.0"]).toContain(
      "múltiplos de 5",
    );
    const three = weekWith(1, true, [
      { start: 60, end: 120 },
      { start: 180, end: 240 },
      { start: 300, end: 360 },
    ]);
    expect(validateWeek(three)?.["days.0"]).toContain("no máximo dois");
    expect(validateWeek(weekWith(1, true, []))?.["days.0"]).toContain("ao menos um");
  });

  it("requires the seven weekdays exactly once", () => {
    expect(validateWeek(closedWeek().slice(0, 6))?.days).toBe("Informe os sete dias da semana.");
    const duplicated = closedWeek().map((day) => (day.weekday === 7 ? { ...day, weekday: 1 } : day));
    expect(validateWeek(duplicated)?.["days.6"]).toContain("repetido");
  });

  it("checks whether a time range falls inside an open interval", () => {
    const week = weekWith(1, true, [
      { start: 480, end: 720 },
      { start: 780, end: 1080 },
    ]);
    expect(isWithinHours(week, 1, 480, 540)).toBe(true);
    expect(isWithinHours(week, 1, 700, 800)).toBe(false);
    expect(isWithinHours(week, 2, 480, 540)).toBe(false);
  });

  it("normalizes weekday and interval order", () => {
    const week = normalizeWeek([
      ...closedWeek().slice(1).reverse(),
      {
        weekday: 1,
        open: true,
        intervals: [
          { start: 780, end: 900 },
          { start: 480, end: 720 },
        ],
      },
    ]);
    expect(week.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(week[0]?.intervals[0]?.start).toBe(480);
  });
});
