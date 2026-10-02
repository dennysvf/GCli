import { describe, expect, it } from "vitest";
import { addDays } from "@/shared/kernel/calendar-date";
import { DateTimeRange } from "@/shared/kernel/date-time-range";
import { localMinuteToUtc } from "@/shared/kernel/zoned-time";
import { findAvailableSlots, type AvailabilityCandidate } from "./availability";
import type { ConflictContext } from "./conflicts/types";

const TZ = "America/Sao_Paulo";
const TODAY = "2026-10-05"; // Monday
const at = (date: string, minute: number) => localMinuteToUtc(date, minute, TZ);
const range = (date: string, start: number, end: number) => {
  const result = DateTimeRange.of(at(date, start), at(date, end));
  if (!result.ok) throw new Error("range");
  return result.value;
};

function weekdayHours(days: number): Map<string, { start: number; end: number }[]> {
  const map = new Map<string, { start: number; end: number }[]>();
  for (let i = 0; i < days; i += 1) map.set(addDays(TODAY, i), [{ start: 9 * 60, end: 11 * 60 }]);
  return map;
}

function candidate(extra: Partial<ConflictContext> = {}, rooms: AvailabilityCandidate["rooms"] = null) {
  return {
    professionalId: "p1",
    professionalName: "Dra. Ana",
    rooms,
    context: {
      timeZone: TZ,
      now: at(TODAY, 9 * 60 + 10),
      professionalName: "Dra. Ana",
      roomName: null,
      appointments: [],
      workingIntervals: weekdayHours(70),
      timeOffs: [],
      businessHours: new Map([1, 2, 3, 4, 5, 6, 7].map((day) => [day, [{ start: 0, end: 1440 }]])),
      closures: [],
      ...extra,
    },
  } satisfies AvailabilityCandidate;
}

const request = {
  unitId: "u1",
  durationMinutes: 50,
  granularity: 30,
  timeZone: TZ,
  now: at(TODAY, 9 * 60 + 10),
};

describe("findAvailableSlots", () => {
  it("F06: availability returns at most 10 slots within 60 days respecting every rule", () => {
    const tomorrow = addDays(TODAY, 1);
    const result = findAvailableSlots(
      [
        candidate(
          {
            appointments: [
              {
                id: "x",
                professionalId: "p1",
                professionalName: "Dra. Ana",
                roomId: null,
                patientId: "pt",
                range: range(tomorrow, 9 * 60, 10 * 60),
                status: "CONFIRMED",
              },
            ],
            timeOffs: [{ range: range(addDays(TODAY, 2), 0, 1440), type: "VACATION" }],
            closures: [{ startsOn: addDays(TODAY, 3), endsOn: addDays(TODAY, 3), reason: "Feriado" }],
          },
          [
            { id: "r1", name: "Sala 1" },
            { id: "r2", name: "Sala 2" },
          ],
        ),
      ],
      { ...request, maxDays: 60, maxSlots: 10 },
    );
    const labels = result.slots.map((slot) => `${slot.date} ${slot.startMinute / 60}`);
    // Today: 09:10 now → 09:30 and 10:00; tomorrow 09:00 busy; day 2 time-off; day 3 closed.
    expect(labels.slice(0, 5)).toEqual([
      `${TODAY} 9.5`,
      `${TODAY} 10`,
      `${tomorrow} 10`,
      `${addDays(TODAY, 4)} 9`,
      `${addDays(TODAY, 4)} 9.5`,
    ]);
    expect(result.slots).toHaveLength(10);
    expect(result.slots.every((slot) => slot.roomId === "r1")).toBe(true);
  });

  it("F06: availability stops at the day limit", () => {
    const result = findAvailableSlots(
      [candidate({ workingIntervals: new Map([[addDays(TODAY, 61), [{ start: 540, end: 660 }]]]) })],
      { ...request, maxDays: 60, maxSlots: 10 },
    );
    expect(result.slots).toEqual([]);
    expect(result.searchedUntil).toBe(addDays(TODAY, 59));
  });
});
