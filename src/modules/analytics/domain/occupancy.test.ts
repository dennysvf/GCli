import { describe, expect, it } from "vitest";
import { computeOccupancy, type OccupancyInput, type OccupancyInterval } from "./occupancy";

const SP = "America/Sao_Paulo";
// 2026-10-05 is a Monday.
const MONDAY = "2026-10-05";

function interval(overrides: Partial<OccupancyInterval> = {}): OccupancyInterval {
  return {
    professionalId: "p1",
    unitId: "u1",
    weekday: 1,
    startMinute: 8 * 60,
    endMinute: 12 * 60,
    validFrom: "2026-01-01",
    validUntil: null,
    ...overrides,
  };
}

// Local São Paulo time (UTC-3, no daylight saving since 2019) as an instant.
const at = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);

function input(overrides: Partial<OccupancyInput> = {}): OccupancyInput {
  return {
    period: { from: MONDAY, to: MONDAY },
    unitZones: new Map([["u1", SP]]),
    intervals: [interval()],
    closures: [],
    timeOffs: [],
    appointments: [],
    ...overrides,
  };
}

describe("dashboard occupancy", () => {
  it("F12: occupancy is booked minutes over working hours minus time-offs and unit closures", () => {
    const week = { from: MONDAY, to: "2026-10-11" };
    const intervals = [interval(), interval({ weekday: 3 })];
    // Wednesday: 2 hours of time-off; Monday of the next week is outside the period.
    const timeOffs = [
      { professionalId: "p1", startsAt: at("2026-10-07", "08:00"), endsAt: at("2026-10-07", "10:00") },
    ];
    const appointments = [
      { professionalId: "p1", startsAt: at(MONDAY, "09:00"), endsAt: at(MONDAY, "10:00") },
      { professionalId: "p1", startsAt: at("2026-10-07", "10:00"), endsAt: at("2026-10-07", "10:30") },
    ];
    expect(computeOccupancy(input({ period: week, intervals, timeOffs, appointments }))).toEqual({
      bookedMinutes: 90,
      availableMinutes: 240 + 120,
    });

    // A closure on Monday removes its hours and its booked minutes.
    const closures = [{ unitId: "u1", startsOn: MONDAY, endsOn: MONDAY }];
    expect(computeOccupancy(input({ period: week, intervals, timeOffs, appointments, closures }))).toEqual({
      bookedMinutes: 30,
      availableMinutes: 120,
    });
  });

  it("F12: overlapping appointments of one professional are counted once and occupancy never exceeds 100%", () => {
    const appointments = [
      { professionalId: "p1", startsAt: at(MONDAY, "08:00"), endsAt: at(MONDAY, "12:00") },
      // Encaixe over the same hours.
      { professionalId: "p1", startsAt: at(MONDAY, "09:00"), endsAt: at(MONDAY, "10:00") },
    ];
    const occupancy = computeOccupancy(input({ appointments }));
    expect(occupancy).toEqual({ bookedMinutes: 240, availableMinutes: 240 });
  });

  it("F12: minutes booked outside working hours do not count", () => {
    const appointments = [
      { professionalId: "p1", startsAt: at(MONDAY, "11:30"), endsAt: at(MONDAY, "12:30") },
      { professionalId: "p1", startsAt: at(MONDAY, "18:00"), endsAt: at(MONDAY, "19:00") },
      // Another professional without working hours adds nothing.
      { professionalId: "p2", startsAt: at(MONDAY, "08:00"), endsAt: at(MONDAY, "09:00") },
    ];
    expect(computeOccupancy(input({ appointments }))).toEqual({ bookedMinutes: 30, availableMinutes: 240 });
  });

  it("F12: working hours on a DST change day use the real length of the local interval", () => {
    // New York springs forward on 2026-03-08 (Sunday) at 02:00: 01:00–05:00 lasts 3 real hours.
    const occupancy = computeOccupancy(
      input({
        period: { from: "2026-03-08", to: "2026-03-08" },
        unitZones: new Map([["u1", "America/New_York"]]),
        intervals: [interval({ weekday: 7, startMinute: 60, endMinute: 300 })],
      }),
    );
    expect(occupancy.availableMinutes).toBe(180);
  });

  it("F12: schedules outside their validity and units outside the filter are ignored", () => {
    const intervals = [
      interval({ validUntil: "2026-10-04" }),
      interval({ unitId: "u2", professionalId: "p2" }),
      interval({ professionalId: "p3", validFrom: "2026-10-05", validUntil: "2026-10-05" }),
    ];
    expect(computeOccupancy(input({ intervals }))).toEqual({ bookedMinutes: 0, availableMinutes: 240 });
  });

  it("F12: occupancy has no available minutes without working hours", () => {
    expect(computeOccupancy(input({ intervals: [] }))).toEqual({ bookedMinutes: 0, availableMinutes: 0 });
  });
});
