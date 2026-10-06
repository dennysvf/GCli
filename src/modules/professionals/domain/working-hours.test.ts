import { describe, expect, it } from "vitest";
import {
  findCrossUnitConflict,
  findOutsideBusinessHours,
  formatInterval,
  validateIntervals,
  type BusinessDay,
  type WorkingInterval,
} from "./working-hours";

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
    expect(validateIntervals(five)).toEqual({ "intervals.4": "professionals.validation.intervals.tooMany" });

    // The same day in another unit counts separately.
    expect(validateIntervals([...four, at(SUL, 2, h(20), h(21))])).toBeNull();

    expect(validateIntervals([at(CENTRO, 1, h(8), h(12)), at(CENTRO, 1, h(11), h(14))])).toEqual({
      "intervals.1": "professionals.validation.intervals.overlap",
    });
    expect(validateIntervals([at(CENTRO, 1, h(12), h(8))])).toHaveProperty("intervals.0");
    expect(validateIntervals([at(CENTRO, 1, h(8, 3), h(12))])).toEqual({
      "intervals.0": "professionals.validation.intervals.granularity",
    });
    expect(validateIntervals([at(CENTRO, 8, h(8), h(12))])).toHaveProperty("intervals.0");
  });

  it("F04: intervals in different units on the same weekday cannot overlap", () => {
    const zones = new Map([
      [CENTRO, "America/Sao_Paulo"],
      [SUL, "America/Sao_Paulo"],
    ]);
    const from = "2026-11-02";
    const tuesday = [at(CENTRO, 2, h(8), h(12)), at(SUL, 2, h(10), h(14))];
    expect(findCrossUnitConflict(tuesday, zones, from)).toEqual({
      index: 1,
      conflictWith: 0,
      date: "2026-11-03",
    });
    expect(
      findCrossUnitConflict([at(CENTRO, 2, h(8), h(12)), at(SUL, 3, h(10), h(14))], zones, from),
    ).toBeNull();
    expect(
      findCrossUnitConflict([at(CENTRO, 2, h(8), h(12)), at(SUL, 2, h(12), h(14))], zones, from),
    ).toBeNull();
  });

  it("F04: cross-unit comparison uses each unit's UTC offset", () => {
    const zones = new Map([
      [CENTRO, "America/Sao_Paulo"],
      [MANAUS, "America/Manaus"],
    ]);
    const from = "2026-11-02";
    // Manaus 07:00–09:00 is 08:00–10:00 in São Paulo.
    expect(
      findCrossUnitConflict([at(CENTRO, 1, h(8), h(12)), at(MANAUS, 1, h(7), h(9))], zones, from),
    ).not.toBeNull();
    // Manaus 11:00–12:00 is 12:00–13:00 in São Paulo.
    expect(
      findCrossUnitConflict([at(CENTRO, 1, h(8), h(12)), at(MANAUS, 1, h(11), h(12))], zones, from),
    ).toBeNull();
    // Sunday late evening in Manaus wraps past the end of the week without false conflicts.
    expect(
      findCrossUnitConflict([at(MANAUS, 7, h(21), h(24)), at(CENTRO, 1, h(8), h(9))], zones, from),
    ).toBeNull();
    // Monday 23:00–24:00 in São Paulo is Tuesday 02:00–03:00 in Lisbon (UTC+0 in November).
    const lisbon = new Map([
      [CENTRO, "America/Sao_Paulo"],
      ["lisboa", "Europe/Lisbon"],
    ]);
    expect(
      findCrossUnitConflict([at(CENTRO, 1, h(23), h(24)), at("lisboa", 2, h(2), h(3))], lisbon, from),
    ).toEqual({ index: 1, conflictWith: 0, date: "2026-11-03" });
  });

  it("F16: cross-unit working hours are compared on concrete dates", () => {
    // São Paulo (UTC-3) Monday 08:00–09:00 is 11:00–12:00 UTC. Lisbon Monday 12:00–13:00 is
    // 12:00–13:00 UTC in winter (no overlap) and 11:00–12:00 UTC in summer (overlap).
    const zones = new Map([
      [CENTRO, "America/Sao_Paulo"],
      ["lisboa", "Europe/Lisbon"],
    ]);
    const intervals = [at(CENTRO, 1, h(8), h(9)), at("lisboa", 1, h(12), h(13))];
    // Lisbon changes to summer time on 2026-03-29: the first Monday with overlap is 2026-03-30.
    expect(findCrossUnitConflict(intervals, zones, "2026-01-05")).toEqual({
      index: 1,
      conflictWith: 0,
      date: "2026-03-30",
    });
    // A schedule that starts after the change overlaps on its first Monday.
    expect(findCrossUnitConflict(intervals, zones, "2026-05-04")?.date).toBe("2026-05-04");
    // Entirely in winter, within a short horizon, there is no overlap.
    expect(findCrossUnitConflict(intervals, zones, "2026-01-05", 10)).toBeNull();
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
