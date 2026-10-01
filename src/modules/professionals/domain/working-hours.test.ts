import { describe, expect, it } from "vitest";
import {
  findCrossUnitConflict,
  findOutsideBusinessHours,
  formatInterval,
  validateIntervals,
  type BusinessDay,
  type WorkingInterval,
} from "./working-hours";
import { utcOffsetMinutes } from "./time-zone-offsets";

const CENTRO = "centro";
const SUL = "sul";
const MANAUS = "manaus";
const h = (hours: number, minutes = 0) => hours * 60 + minutes;
const at = (unitId: string, weekday: number, start: number, end: number): WorkingInterval => ({
  unitId,
  weekday,
  start,
  end,
});

describe("working-hour intervals", () => {
  it("F04: at most 4 intervals per unit and weekday, ordered, without overlap", () => {
    const four = [1, 2, 3, 4].map((n) => at(CENTRO, 2, h(6 + n * 2), h(7 + n * 2)));
    expect(validateIntervals(four)).toBeNull();

    const five = [...four, at(CENTRO, 2, h(20), h(21))];
    expect(validateIntervals(five)).toEqual({ "intervals.4": expect.stringContaining("No máximo 4") });

    // The same day in another unit counts separately.
    expect(validateIntervals([...four, at(SUL, 2, h(20), h(21))])).toBeNull();

    expect(validateIntervals([at(CENTRO, 1, h(8), h(12)), at(CENTRO, 1, h(11), h(14))])).toEqual({
      "intervals.1": "Os intervalos de um mesmo dia não podem se sobrepor.",
    });
    expect(validateIntervals([at(CENTRO, 1, h(12), h(8))])).toHaveProperty("intervals.0");
    expect(validateIntervals([at(CENTRO, 1, h(8, 3), h(12))])).toEqual({
      "intervals.0": "Use horários em múltiplos de 5 minutos.",
    });
    expect(validateIntervals([at(CENTRO, 8, h(8), h(12))])).toHaveProperty("intervals.0");
  });

  it("F04: intervals in different units on the same weekday cannot overlap", () => {
    const offsets = new Map([
      [CENTRO, -180],
      [SUL, -180],
    ]);
    const tuesday = [at(CENTRO, 2, h(8), h(12)), at(SUL, 2, h(10), h(14))];
    expect(findCrossUnitConflict(tuesday, offsets)).toEqual({ index: 1, conflictWith: 0 });
    expect(findCrossUnitConflict([at(CENTRO, 2, h(8), h(12)), at(SUL, 3, h(10), h(14))], offsets)).toBeNull();
    expect(findCrossUnitConflict([at(CENTRO, 2, h(8), h(12)), at(SUL, 2, h(12), h(14))], offsets)).toBeNull();
  });

  it("F04: cross-unit comparison uses each unit's UTC offset", () => {
    const instant = new Date("2026-11-02T12:00:00Z");
    const offsets = new Map([
      [CENTRO, utcOffsetMinutes("America/Sao_Paulo", instant)],
      [MANAUS, utcOffsetMinutes("America/Manaus", instant)],
    ]);
    expect(offsets.get(CENTRO)).toBe(-180);
    expect(offsets.get(MANAUS)).toBe(-240);
    // Manaus 07:00–09:00 is 08:00–10:00 in São Paulo.
    expect(
      findCrossUnitConflict([at(CENTRO, 1, h(8), h(12)), at(MANAUS, 1, h(7), h(9))], offsets),
    ).not.toBeNull();
    // Manaus 11:00–12:00 is 12:00–13:00 in São Paulo.
    expect(
      findCrossUnitConflict([at(CENTRO, 1, h(8), h(12)), at(MANAUS, 1, h(11), h(12))], offsets),
    ).toBeNull();
    // Sunday late evening in Manaus wraps past the end of the UTC week without false conflicts.
    expect(
      findCrossUnitConflict([at(MANAUS, 7, h(21), h(24)), at(CENTRO, 1, h(8), h(9))], offsets),
    ).toBeNull();
  });

  it("F04: intervals outside the unit's business hours are reported with the unit's hours", () => {
    const week: BusinessDay[] = [
      { weekday: 1, open: false, intervals: [] },
      { weekday: 2, open: true, intervals: [{ start: h(8), end: h(18) }] },
    ];
    const weeks = new Map([[CENTRO, week]]);
    const outside = findOutsideBusinessHours(
      [at(CENTRO, 2, h(9), h(12)), at(CENTRO, 2, h(7), h(9)), at(CENTRO, 1, h(9), h(10))],
      weeks,
    );
    expect(outside.map((item) => item.index)).toEqual([1, 2]);
    expect(outside[0]?.day?.intervals.map(formatInterval)).toEqual(["08:00–18:00"]);
    expect(outside[1]?.day?.open).toBe(false);
  });
});
