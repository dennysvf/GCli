import { addDays, isoWeekday } from "@/shared/kernel/calendar-date";
import { localMinuteToUtc } from "@/shared/kernel/zoned-time";
import type { DateRange } from "./period";

export type OccupancyInterval = {
  professionalId: string;
  unitId: string;
  weekday: number; // ISO: 1 = Monday … 7 = Sunday
  startMinute: number;
  endMinute: number;
  validFrom: string;
  validUntil: string | null;
};
export type OccupancyClosure = { unitId: string; startsOn: string; endsOn: string };
export type OccupancyRange = { professionalId: string; startsAt: Date; endsAt: Date };

export type OccupancyInput = {
  period: DateRange;
  // Time zone of every unit in the filter; intervals of other units are ignored.
  unitZones: ReadonlyMap<string, string>;
  intervals: readonly OccupancyInterval[];
  closures: readonly OccupancyClosure[];
  timeOffs: readonly OccupancyRange[];
  // Non-cancelled appointments (Encaixes and no-shows included).
  appointments: readonly OccupancyRange[];
};

export type Occupancy = { bookedMinutes: number; availableMinutes: number };

type Span = [number, number];

// Sorted, non-overlapping spans covering the same instants.
function union(spans: Span[]): Span[] {
  const sorted = spans.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  const merged: Span[] = [];
  for (const [start, end] of sorted) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

// `base` minus `cut`; both are unions.
function subtract(base: Span[], cut: Span[]): Span[] {
  const result: Span[] = [];
  let index = 0;
  for (const [start, end] of base) {
    let cursor = start;
    while (index < cut.length && (cut[index]?.[1] ?? 0) <= cursor) index++;
    for (let probe = index; probe < cut.length; probe++) {
      const [cutStart, cutEnd] = cut[probe] as Span;
      if (cutStart >= end) break;
      if (cutStart > cursor) result.push([cursor, cutStart]);
      cursor = Math.max(cursor, cutEnd);
    }
    if (cursor < end) result.push([cursor, end]);
  }
  return result;
}

// Total length shared by two unions.
function overlapLength(a: Span[], b: Span[]): number {
  let total = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const [aStart, aEnd] = a[i] as Span;
    const [bStart, bEnd] = b[j] as Span;
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    if (end > start) total += end - start;
    if (aEnd < bEnd) i++;
    else j++;
  }
  return total;
}

function length(spans: Span[]): number {
  return spans.reduce((sum, [start, end]) => sum + (end - start), 0);
}

function push(map: Map<string, Span[]>, key: string, span: Span): void {
  const list = map.get(key);
  if (list) list.push(span);
  else map.set(key, [span]);
}

// PRD F12 occupancy, with spec F12 decision D2: available = working intervals − time-offs − unit
// closures; booked = the union of each professional's appointments, counted only inside the
// available time, so the rate never exceeds 100%. Local working hours become instants per date in
// the unit's zone, which keeps daylight-saving days correct (ADR-030).
export function computeOccupancy(input: OccupancyInput): Occupancy {
  const closed = (unitId: string, date: string) =>
    input.closures.some(
      (closure) => closure.unitId === unitId && closure.startsOn <= date && date <= closure.endsOn,
    );

  const available = new Map<string, Span[]>();
  for (let date = input.period.from; date <= input.period.to; date = addDays(date, 1)) {
    const weekday = isoWeekday(date);
    for (const interval of input.intervals) {
      const zone = input.unitZones.get(interval.unitId);
      if (!zone || interval.weekday !== weekday) continue;
      if (interval.validFrom > date || (interval.validUntil !== null && interval.validUntil < date)) continue;
      if (closed(interval.unitId, date)) continue;
      push(available, interval.professionalId, [
        localMinuteToUtc(date, interval.startMinute, zone).getTime(),
        localMinuteToUtc(date, interval.endMinute, zone).getTime(),
      ]);
    }
  }

  const timeOffs = new Map<string, Span[]>();
  for (const off of input.timeOffs)
    push(timeOffs, off.professionalId, [off.startsAt.getTime(), off.endsAt.getTime()]);
  const booked = new Map<string, Span[]>();
  for (const item of input.appointments)
    push(booked, item.professionalId, [item.startsAt.getTime(), item.endsAt.getTime()]);

  let availableMs = 0;
  let bookedMs = 0;
  for (const [professionalId, spans] of available) {
    const free = subtract(union(spans), union(timeOffs.get(professionalId) ?? []));
    availableMs += length(free);
    bookedMs += overlapLength(free, union(booked.get(professionalId) ?? []));
  }
  return { bookedMinutes: Math.round(bookedMs / 60_000), availableMinutes: Math.round(availableMs / 60_000) };
}
