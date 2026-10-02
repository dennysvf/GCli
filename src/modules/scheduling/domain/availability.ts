import { addDays } from "@/shared/kernel/calendar-date";
import { utcToZonedParts } from "@/shared/kernel/zoned-time";
import { rangeAt } from "./agenda-time";
import { checkConflicts, isFree } from "./conflicts/check";
import type { ConflictContext } from "./conflicts/types";

// "Próximo horário livre" (PRD F06): the next free slots for a service, respecting every conflict
// rule without overrides (no Encaixe, no exceptions), within a number of days. Specification
// pattern: the same checkConflicts that guards saving decides whether a slot is free.

export type AvailabilityCandidate = {
  professionalId: string;
  professionalName: string;
  // Loaded for the whole search window: appointments, working intervals, time-offs, unit hours.
  context: ConflictContext;
  // Rooms to try in order; null when the service needs no room.
  rooms: { id: string; name: string }[] | null;
  // The appointment being moved, which never conflicts with itself.
  excludeAppointmentId?: string;
};

export type AvailabilityRequest = {
  unitId: string;
  durationMinutes: number;
  granularity: number;
  timeZone: string;
  now: Date;
  maxDays: number;
  maxSlots: number;
};

export type AvailableSlot = {
  date: string;
  startMinute: number;
  startsAt: Date;
  professionalId: string;
  professionalName: string;
  roomId: string | null;
  roomName: string | null;
};

function firstStart(intervalStart: number, earliest: number, granularity: number): number {
  const from = Math.max(intervalStart, earliest);
  return Math.ceil(from / granularity) * granularity;
}

function slotsOfDay(
  date: string,
  candidate: AvailabilityCandidate,
  request: AvailabilityRequest,
  earliestMinute: number,
): AvailableSlot[] {
  const found: AvailableSlot[] = [];
  const intervals = candidate.context.workingIntervals.get(date) ?? [];
  for (const interval of intervals) {
    let start = firstStart(interval.start, earliestMinute, request.granularity);
    for (; start + request.durationMinutes <= interval.end; start += request.granularity) {
      const range = rangeAt(date, start, request.durationMinutes, request.timeZone);
      const rooms = candidate.rooms ?? [null];
      for (const room of rooms) {
        const findings = checkConflicts(
          {
            ...(candidate.excludeAppointmentId ? { appointmentId: candidate.excludeAppointmentId } : {}),
            unitId: request.unitId,
            professionalId: candidate.professionalId,
            roomId: room?.id ?? null,
            patientId: "",
            range,
          },
          { ...candidate.context, roomName: room?.name ?? null },
          { canOverrideAvailability: false, checkPastStart: true },
        );
        if (isFree(findings)) {
          found.push({
            date,
            startMinute: start,
            startsAt: range.start,
            professionalId: candidate.professionalId,
            professionalName: candidate.professionalName,
            roomId: room?.id ?? null,
            roomName: room?.name ?? null,
          });
          break;
        }
      }
    }
  }
  return found;
}

// Day by day from today: all candidates' free slots of a day, earliest first, until maxSlots.
export function findAvailableSlots(
  candidates: AvailabilityCandidate[],
  request: AvailabilityRequest,
): { slots: AvailableSlot[]; searchedUntil: string } {
  const today = utcToZonedParts(request.now, request.timeZone);
  const slots: AvailableSlot[] = [];
  let date = today.date;
  const lastDate = addDays(today.date, request.maxDays - 1);
  for (; date <= lastDate && slots.length < request.maxSlots; date = addDays(date, 1)) {
    const earliest = date === today.date ? today.minute + 1 : 0;
    const daySlots = candidates
      .flatMap((candidate) => slotsOfDay(date, candidate, request, earliest))
      .sort(
        (a, b) =>
          a.startMinute - b.startMinute || a.professionalName.localeCompare(b.professionalName, "pt-BR"),
      );
    slots.push(...daySlots.slice(0, request.maxSlots - slots.length));
  }
  return { slots, searchedUntil: slots.length >= request.maxSlots ? addDays(date, -1) : lastDate };
}

// Up to `limit` free start times on one date for one candidate (series conflict suggestions).
export function freeStartsOnDate(
  date: string,
  candidate: AvailabilityCandidate,
  request: Omit<AvailabilityRequest, "maxDays" | "maxSlots">,
  limit: number,
): AvailableSlot[] {
  const today = utcToZonedParts(request.now, request.timeZone);
  if (date < today.date) return [];
  const earliest = date === today.date ? today.minute + 1 : 0;
  return slotsOfDay(date, candidate, { ...request, maxDays: 1, maxSlots: limit }, earliest).slice(0, limit);
}
