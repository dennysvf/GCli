import { describe, expect, it } from "vitest";
import {
  DURATION_OPTIONS,
  formatDuration,
  isValidDuration,
  isValidPriceCents,
  resolveAllowedRooms,
} from "./service-rules";

describe("service rules", () => {
  it("F03: duration must be 5–480 in multiples of 5", () => {
    for (const minutes of [5, 95, 480]) expect(isValidDuration(minutes)).toBe(true);
    for (const minutes of [0, 3, 7, 485, 12.5]) expect(isValidDuration(minutes)).toBe(false);
    expect(DURATION_OPTIONS[0]).toBe(5);
    expect(DURATION_OPTIONS.at(-1)).toBe(480);
    expect(DURATION_OPTIONS).toHaveLength(96);
  });

  it("F03: price must be between 0 and 9 999 999 cents", () => {
    for (const cents of [0, 18000, 9_999_999]) expect(isValidPriceCents(cents)).toBe(true);
    for (const cents of [-1, 10_000_000, 1.5]) expect(isValidPriceCents(cents)).toBe(false);
  });

  it("F03: durations are formatted for display", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(90)).toBe("1h 30min");
    expect(formatDuration(120)).toBe("2h");
  });

  it("F03: allowed rooms are restricted per unit", () => {
    const rooms = [
      { id: "r2", name: "Sala 2", active: true, unitId: "a" },
      { id: "r1", name: "Sala 1", active: true, unitId: "a" },
      { id: "r3", name: "Sala 3", active: false, unitId: "b" },
    ];
    expect(resolveAllowedRooms(rooms, "c")).toBe("any");
    expect(resolveAllowedRooms(rooms, "a")).toEqual([
      { id: "r1", name: "Sala 1" },
      { id: "r2", name: "Sala 2" },
    ]);
    expect(resolveAllowedRooms(rooms, "b")).toEqual([]);
  });
});
